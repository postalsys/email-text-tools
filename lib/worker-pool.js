'use strict';

const { Worker } = require('worker_threads');
const path = require('path');
const { EventEmitter } = require('events');

class WorkerPool extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.workerPath = options.workerPath || path.join(__dirname, 'juice-worker.js');
        this.minWorkers = options.minWorkers || 2;
        this.maxWorkers = options.maxWorkers || 4;
        this.maxQueueSize = options.maxQueueSize || 100;
        this.workerTimeout = options.workerTimeout || 10000;
        this.idleTimeout = options.idleTimeout || 30000;
        
        this.workers = [];
        this.freeWorkers = [];
        this.queue = [];
        this.closing = false;
        
        // Initialize minimum number of workers
        this._initWorkers();
    }
    
    _initWorkers() {
        for (let i = 0; i < this.minWorkers; i++) {
            this._createWorker();
        }
    }
    
    _createWorker() {
        if (this.closing) return null;
        
        const worker = new Worker(this.workerPath);
        const workerInfo = {
            worker,
            busy: false,
            lastUsed: Date.now(),
            timeoutHandle: null,
            currentTask: null
        };
        
        worker.on('message', (msg) => {
            if (workerInfo.currentTask) {
                const { resolve, reject, timeoutHandle } = workerInfo.currentTask;
                clearTimeout(timeoutHandle);
                
                if (msg.success) {
                    resolve(msg.result);
                } else {
                    reject(new Error(msg.error));
                }
                
                workerInfo.currentTask = null;
                workerInfo.busy = false;
                workerInfo.lastUsed = Date.now();
                
                // Add worker back to free list if not already there
                if (!this.freeWorkers.includes(workerInfo)) {
                    this.freeWorkers.push(workerInfo);
                }
                
                // Process next item in queue
                this._processQueue();
            }
        });
        
        worker.on('error', (err) => {
            if (workerInfo.currentTask) {
                const { reject, timeoutHandle } = workerInfo.currentTask;
                clearTimeout(timeoutHandle);
                reject(err);
                workerInfo.currentTask = null;
            }
            
            // Remove failed worker
            const index = this.workers.indexOf(workerInfo);
            if (index > -1) {
                this.workers.splice(index, 1);
            }
            
            const freeIndex = this.freeWorkers.indexOf(workerInfo);
            if (freeIndex > -1) {
                this.freeWorkers.splice(freeIndex, 1);
            }
            
            // Create replacement if below minimum
            if (this.workers.length < this.minWorkers && !this.closing) {
                this._createWorker();
            }
            
            // Process queue with remaining workers
            this._processQueue();
        });
        
        worker.on('exit', () => {
            // Clean up worker references
            const index = this.workers.indexOf(workerInfo);
            if (index > -1) {
                this.workers.splice(index, 1);
            }
            
            const freeIndex = this.freeWorkers.indexOf(workerInfo);
            if (freeIndex > -1) {
                this.freeWorkers.splice(freeIndex, 1);
            }
        });
        
        this.workers.push(workerInfo);
        this.freeWorkers.push(workerInfo);
        
        // Set up idle timeout for workers above minimum
        if (this.workers.length > this.minWorkers) {
            this._setupIdleTimeout(workerInfo);
        }
        
        return workerInfo;
    }
    
    _setupIdleTimeout(workerInfo) {
        if (workerInfo.timeoutHandle) {
            clearTimeout(workerInfo.timeoutHandle);
        }
        
        workerInfo.timeoutHandle = setTimeout(() => {
            if (!workerInfo.busy && this.workers.length > this.minWorkers) {
                this._removeWorker(workerInfo);
            }
        }, this.idleTimeout);
    }
    
    _removeWorker(workerInfo) {
        const index = this.workers.indexOf(workerInfo);
        if (index > -1) {
            this.workers.splice(index, 1);
        }
        
        const freeIndex = this.freeWorkers.indexOf(workerInfo);
        if (freeIndex > -1) {
            this.freeWorkers.splice(freeIndex, 1);
        }
        
        if (workerInfo.timeoutHandle) {
            clearTimeout(workerInfo.timeoutHandle);
        }
        
        workerInfo.worker.terminate();
    }
    
    async process(data, options = {}) {
        if (this.closing) {
            throw new Error('Worker pool is closing');
        }
        
        const timeout = options.timeout || this.workerTimeout;
        
        return new Promise((resolve, reject) => {
            const task = { data, resolve, reject, timeout };
            
            // Try to get a free worker
            const workerInfo = this.freeWorkers.shift();
            
            if (workerInfo) {
                this._executeTask(workerInfo, task);
            } else if (this.workers.length < this.maxWorkers) {
                // Create new worker if below max
                const newWorker = this._createWorker();
                if (newWorker) {
                    this.freeWorkers.shift(); // Remove from free list
                    this._executeTask(newWorker, task);
                }
            } else if (this.queue.length < this.maxQueueSize) {
                // Queue the task
                this.queue.push(task);
            } else {
                reject(new Error('Worker pool queue is full'));
            }
        });
    }
    
    _executeTask(workerInfo, task) {
        workerInfo.busy = true;
        workerInfo.lastUsed = Date.now();
        
        // Clear idle timeout while working
        if (workerInfo.timeoutHandle) {
            clearTimeout(workerInfo.timeoutHandle);
            workerInfo.timeoutHandle = null;
        }
        
        // Set up task timeout
        const timeoutHandle = setTimeout(() => {
            task.reject(new Error(`Worker task timed out after ${task.timeout}ms`));
            workerInfo.currentTask = null;
            workerInfo.busy = false;
            
            // Terminate and replace the worker
            this._removeWorker(workerInfo);
            if (this.workers.length < this.minWorkers && !this.closing) {
                this._createWorker();
            }
            
            this._processQueue();
        }, task.timeout);
        
        workerInfo.currentTask = { ...task, timeoutHandle };
        workerInfo.worker.postMessage(task.data);
    }
    
    _processQueue() {
        if (this.queue.length === 0) {
            // Mark free workers and set up idle timeouts
            this.workers.forEach(workerInfo => {
                if (!workerInfo.busy && !this.freeWorkers.includes(workerInfo)) {
                    this.freeWorkers.push(workerInfo);
                    if (this.workers.length > this.minWorkers) {
                        this._setupIdleTimeout(workerInfo);
                    }
                }
            });
            return;
        }
        
        const workerInfo = this.freeWorkers.shift();
        if (workerInfo) {
            const task = this.queue.shift();
            if (task) {
                this._executeTask(workerInfo, task);
            }
        }
    }
    
    async close() {
        this.closing = true;
        
        // Clear the queue
        while (this.queue.length > 0) {
            const task = this.queue.shift();
            task.reject(new Error('Worker pool is closing'));
        }
        
        // Terminate all workers
        const terminatePromises = this.workers.map(workerInfo => {
            if (workerInfo.timeoutHandle) {
                clearTimeout(workerInfo.timeoutHandle);
            }
            return workerInfo.worker.terminate();
        });
        
        await Promise.all(terminatePromises);
        
        this.workers = [];
        this.freeWorkers = [];
    }
    
    getStats() {
        return {
            totalWorkers: this.workers.length,
            busyWorkers: this.workers.filter(w => w.busy).length,
            freeWorkers: this.freeWorkers.length,
            queuedTasks: this.queue.length,
            minWorkers: this.minWorkers,
            maxWorkers: this.maxWorkers
        };
    }
}

module.exports = WorkerPool;