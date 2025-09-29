# Performance Guide for email-text-tools

## Overview

The `mime-html` module now provides both synchronous and asynchronous versions with configurable options for handling CSS processing. The async version includes worker thread support with pooling for high-throughput scenarios.

## Performance Characteristics

### Benchmark Results

Based on our benchmarks with various HTML complexities:

| Method                 | Average Time | Use Case                                             |
| ---------------------- | ------------ | ---------------------------------------------------- |
| **Sync**               | 5-10ms       | Low-latency, simple HTML, single requests            |
| **Async with Pool**    | 5-10ms       | High-throughput, concurrent processing               |
| **Async without Pool** | 100-110ms    | Isolated processing, memory-constrained environments |

### Key Findings

1. **Worker Pool Advantage**: The worker pool is **13.6x faster** than creating new workers for each request
2. **Sync vs Async**: For simple HTML, sync and async with pool have similar performance (~5-10ms)
3. **Startup Overhead**: Single worker creation adds ~100ms overhead per request
4. **Problematic CSS**: Both versions pre-filter known problematic selectors for optimal performance
5. **Timeout Protection**: The async version's timeout is rarely triggered thanks to pre-filtering, serving only as a safety net for unknown edge cases

## API Usage

### Synchronous Version (Default)

```javascript
const mimeHtml = require('@postalsys/email-text-tools/lib/mime-html');

// Simple usage - backward compatible
const result = mimeHtml({ html: htmlContent });

// Or explicitly use sync
const result = mimeHtml.sync({ html: htmlContent });
```

### Asynchronous Version with Options

```javascript
const mimeHtml = require('@postalsys/email-text-tools/lib/mime-html');

// With default worker pool
const result = await mimeHtml.async(
    { html: htmlContent },
    {
        timeout: 5000, // Timeout in ms (default: 5000)
        useWorkerPool: true, // Use worker pool (default: true)
        minWorkers: 2, // Minimum pool workers (default: 2)
        maxWorkers: 4, // Maximum pool workers (default: 4)
        fallbackOnError: true, // Continue on error (default: true)
        logErrors: true // Log errors to console (default: true)
    }
);

// Without worker pool (creates new worker each time)
const result = await mimeHtml.async({ html: htmlContent }, { useWorkerPool: false });
```

## Configuration Options

### Async Options

| Option            | Type    | Default | Description                                       |
| ----------------- | ------- | ------- | ------------------------------------------------- |
| `timeout`         | number  | 5000    | Maximum time (ms) for CSS processing              |
| `useWorkerPool`   | boolean | true    | Use worker pool for better performance            |
| `minWorkers`      | number  | 2       | Minimum workers in pool                           |
| `maxWorkers`      | number  | 4       | Maximum workers in pool                           |
| `fallbackOnError` | boolean | true    | Return unstyled HTML on error instead of throwing |
| `logErrors`       | boolean | true    | Log processing errors to console                  |
| `idleTimeout`     | number  | 30000   | Time (ms) before idle workers are terminated      |

## Worker Pool Management

### Monitoring Pool Status

```javascript
// Get current pool statistics
const stats = mimeHtml.getWorkerPoolStats();
console.log(stats);
// {
//   totalWorkers: 2,
//   busyWorkers: 0,
//   freeWorkers: 2,
//   queuedTasks: 0,
//   minWorkers: 2,
//   maxWorkers: 4
// }
```

### Manual Pool Cleanup

```javascript
// Close worker pool when done (automatic on process exit)
await mimeHtml.closeWorkerPool();
```

## Choosing the Right Method

### Use Sync When:

- Processing single emails
- Low-latency is critical (<10ms)
- Simple HTML without complex CSS
- Running in resource-constrained environments

### Use Async with Pool When:

- Processing many emails concurrently
- Running a high-throughput service
- Need timeout protection for untrusted content
- Can accept slight latency for robustness

### Use Async without Pool When:

- Processing untrusted content occasionally
- Memory constraints prevent worker pooling
- Isolation between requests is critical

## Performance Optimization Tips

1. **Reuse the Worker Pool**: The global worker pool is shared across all async calls. Don't close it between requests.

2. **Tune Pool Size**: Adjust `minWorkers` and `maxWorkers` based on your workload:

    ```javascript
    // For high-throughput services
    { minWorkers: 4, maxWorkers: 8 }

    // For occasional processing
    { minWorkers: 1, maxWorkers: 2 }
    ```

3. **Handle Timeouts Gracefully**: Set appropriate timeouts based on HTML complexity:

    ```javascript
    // For simple HTML
    {
        timeout: 2000;
    }

    // For complex HTML with many styles
    {
        timeout: 10000;
    }
    ```

4. **Monitor Pool Health**: In production, monitor pool statistics to detect issues:
    ```javascript
    setInterval(() => {
        const stats = mimeHtml.getWorkerPoolStats();
        if (stats && stats.queuedTasks > 10) {
            console.warn('High queue depth:', stats.queuedTasks);
        }
    }, 5000);
    ```

## Handling Problematic CSS

The library handles modern CSS selectors that cause the juice library to hang:

### Problematic Selectors

- `:is()` pseudo-class
- `:where()` pseudo-class
- `:has()` pseudo-class
- Complex `:not()` selectors

### How It's Handled

**Both Versions**: Pre-process HTML to remove known problematic selectors before juice processing. This prevents most hangs from occurring in the first place.

**Key Difference**:

- **Sync Version**: Pre-filters selectors, then runs juice synchronously. Can still hang if an unknown problematic pattern is encountered.
- **Async Version**: Pre-filters selectors (same as sync), then runs juice in a worker thread with timeout protection. Provides complete safety against any CSS that might cause hangs, even unknown patterns.

The timeout in the async version is a safety net for edge cases, not the primary defense. Both versions handle the known problematic selectors efficiently without timing out.

### Example

```javascript
const problematicHtml = `
<style>
  .item:is(.active, .selected) { background: yellow; }
  .parent:has(> .child) { border: 1px solid red; }
</style>
<div class="item active">Content</div>
`;

// Both handle it safely
const syncResult = mimeHtml.sync({ html: problematicHtml });
const asyncResult = await mimeHtml.async({ html: problematicHtml });
```

## Memory Considerations

- Each worker uses ~10-20MB of memory
- Worker pool maintains minimum workers even when idle
- Adjust pool size based on available memory:
    - Low memory: `{ minWorkers: 1, maxWorkers: 2 }`
    - Standard: `{ minWorkers: 2, maxWorkers: 4 }`
    - High memory: `{ minWorkers: 4, maxWorkers: 8 }`

## Error Handling

```javascript
try {
    // With fallback (default) - returns unstyled HTML on error
    const result = await mimeHtml.async({ html: htmlContent }, { fallbackOnError: true });
} catch (err) {
    // Only throws if fallbackOnError: false
    console.error('Processing failed:', err);
}

// Check for processing issues
const result = await mimeHtml.async(
    { html: htmlContent },
    {
        logErrors: false, // Suppress console warnings
        fallbackOnError: true
    }
);
```

## Migration Guide

### From v2.0.x to v2.1.x

The default behavior remains unchanged - existing code will continue to work:

```javascript
// This still works exactly as before
const result = mimeHtml({ html: htmlContent });
```

To leverage new features:

```javascript
// Before - only sync available
const result = mimeHtml({ html: htmlContent });

// After - use async for better protection
const result = await mimeHtml.async({ html: htmlContent }, { timeout: 5000 });
```

### For High-Volume Processing

```javascript
// Before - sequential processing
for (const email of emails) {
    const result = mimeHtml({ html: email.html });
    // Process result
}

// After - concurrent with worker pool
const results = await Promise.all(emails.map(email => mimeHtml.async({ html: email.html }, { useWorkerPool: true })));
```
