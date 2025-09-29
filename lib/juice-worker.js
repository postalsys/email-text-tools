'use strict';

const { parentPort } = require('worker_threads');
const juice = require('juice');

parentPort.on('message', html => {
    try {
        const result = juice(html);
        parentPort.postMessage({ success: true, result });
    } catch (error) {
        parentPort.postMessage({ success: false, error: error.message });
    }
});
