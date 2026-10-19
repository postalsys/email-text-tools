import workerThreads from 'node:worker_threads';
// Pinned to juice 11.x: juice 12+ is pure ESM (requires Node >=22.12) and breaks pkg builds.
import juice from 'juice';

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
