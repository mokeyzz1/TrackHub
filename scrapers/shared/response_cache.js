/**
 * Small in-process response cache for historical source pages.
 *
 * Historical meet pages are immutable for this worker's purposes. The cache also shares an
 * in-flight request, so duplicate queue rows cannot issue the same network request twice while
 * a batch is running. Errors are never cached.
 */
class ResponseCache {
  constructor({ ttlMs = 6 * 60 * 60 * 1000, maxEntries = 2000, now = () => Date.now() } = {}) {
    this.ttlMs = Math.max(0, Number(ttlMs) || 0);
    this.maxEntries = Math.max(1, Number(maxEntries) || 1);
    this.now = now;
    this.values = new Map();
    this.inFlight = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  async get(key, loader) {
    const cacheKey = String(key || '');
    if (!cacheKey) throw new Error('response cache key is required');
    if (typeof loader !== 'function') throw new Error('response cache loader is required');

    const cached = this.values.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) {
      this.hits++;
      return cached.value;
    }
    if (cached) this.values.delete(cacheKey);

    const pending = this.inFlight.get(cacheKey);
    if (pending) {
      this.hits++;
      return pending;
    }

    this.misses++;
    const request = Promise.resolve().then(loader).then(value => {
      this.values.set(cacheKey, { value, expiresAt: this.now() + this.ttlMs });
      while (this.values.size > this.maxEntries) {
        this.values.delete(this.values.keys().next().value);
      }
      return value;
    });
    this.inFlight.set(cacheKey, request);
    try {
      return await request;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  stats() {
    return {
      entries: this.values.size,
      in_flight: this.inFlight.size,
      hits: this.hits,
      misses: this.misses,
    };
  }

  clear() {
    this.values.clear();
    this.inFlight.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

module.exports = { ResponseCache };
