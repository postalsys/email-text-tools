'use strict';

const { parentPort } = require('worker_threads');
// Pinned to juice 11.x: juice 12+ is pure ESM (requires Node >=22.12) and breaks pkg builds.
// The `.default` fallback keeps this working if juice ever ships a CJS-compatible build again.
const juice = require('juice').default || require('juice');

parentPort.on('message', html => {
    try {
        const result = juice(html);
        parentPort.postMessage({ success: true, result });
    } catch (error) {
        parentPort.postMessage({ success: false, error: error.message });
    }
});
