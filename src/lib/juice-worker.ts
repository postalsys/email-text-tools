import workerThreads from 'node:worker_threads';
// juice comes from the CommonJS bundle in dist/vendor, see juice.cts
import { juice } from './juice.cjs';

// Runs as a worker thread (see worker-pool.ts), the parent port is always there
const parentPort = workerThreads.parentPort!;

parentPort.on('message', (html: string) => {
    try {
        const result = juice(html);
        parentPort.postMessage({ success: true, result });
    } catch (error) {
        parentPort.postMessage({ success: false, error: (error as Error).message });
    }
});
