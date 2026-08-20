/**
 * Small, defensive client for AthleticNET's public autocomplete endpoint.
 *
 * This is a candidate-discovery API, not an identity authority. Callers must
 * verify a returned profile against school/team and (when available) TFRRS
 * evidence before creating an athlete alias.
 */

const DEFAULT_ENDPOINT = 'https://www.athletic.net/api/v1/AutoComplete/search';
const DEFAULT_HEADERS = Object.freeze({
  'User-Agent': 'TrackMeetTracker/1.0',
  Accept: 'application/json',
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class AthleticNetApiError extends Error {
  constructor(message, { code = 'ATHLETIC_NET_API_ERROR', status = null, retryable = false } = {}) {
    super(message);
    this.name = 'AthleticNetApiError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  return headers[name] || headers[name.toLowerCase()] || '';
}

function retryAfterMs(headers) {
  const value = headerValue(headers, 'retry-after').trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : null;
}

function isHtmlResponse(contentType, body) {
  const type = String(contentType || '').toLowerCase();
  const prefix = String(body || '').trim().slice(0, 160).toLowerCase();
  return type.includes('text/html') || /^<!doctype html|^<html|^<head/.test(prefix);
}

function validateSearchPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new AthleticNetApiError('Athletic.net search returned a non-object payload', {
      code: 'INVALID_JSON'
    });
  }
  if (!payload.response || !Array.isArray(payload.response.docs)) {
    throw new AthleticNetApiError('Athletic.net search returned an unexpected schema', {
      code: 'INVALID_SCHEMA'
    });
  }
  return payload;
}

class AthleticNetSearchClient {
  constructor({
    endpoint = DEFAULT_ENDPOINT,
    fetchImpl = globalThis.fetch,
    minDelayMs = 100,
    maxRetries = 3,
    retryBackoffMs = 500,
    timeoutMs = 10000,
    sleepImpl = sleep,
    now = () => Date.now(),
    headers = DEFAULT_HEADERS,
    cache = new Map(),
  } = {}) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch is required');
    this.endpoint = endpoint;
    this.fetchImpl = fetchImpl;
    this.minDelayMs = Math.max(0, Number(minDelayMs) || 0);
    this.maxRetries = Math.max(0, Number(maxRetries) || 0);
    this.retryBackoffMs = Math.max(0, Number(retryBackoffMs) || 0);
    this.timeoutMs = Math.max(0, Number(timeoutMs) || 0);
    this.sleepImpl = sleepImpl;
    this.now = now;
    this.headers = { ...DEFAULT_HEADERS, ...headers };
    this.cache = cache;
    this.lastRequestAt = 0;
  }

  cacheKey(query, sport) {
    return `${String(sport || 'tf').trim().toLowerCase()}|${String(query || '').trim().toLowerCase()}`;
  }

  async waitForRequestSlot() {
    const waitMs = this.minDelayMs - (this.now() - this.lastRequestAt);
    if (waitMs > 0) await this.sleepImpl(waitMs);
    this.lastRequestAt = this.now();
  }

  async request(url) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer = null;
    if (controller && this.timeoutMs > 0) {
      timer = setTimeout(() => controller.abort(), this.timeoutMs);
    }

    try {
      const response = await this.fetchImpl(url, {
        headers: this.headers,
        ...(controller ? { signal: controller.signal } : {})
      });
      const body = await response.text();

      if (response.status === 429) {
        const error = new AthleticNetApiError('RATE_LIMITED', {
          code: 'RATE_LIMITED', status: 429, retryable: true,
        });
        error.retryAfterMs = retryAfterMs(response.headers);
        throw error;
      }
      if (!response.ok) {
        throw new AthleticNetApiError(`HTTP ${response.status}`, {
          code: `HTTP_${response.status}`, status: response.status,
          retryable: response.status >= 500,
        });
      }
      if (isHtmlResponse(headerValue(response.headers, 'content-type'), body)) {
        throw new AthleticNetApiError('Athletic.net returned HTML instead of JSON', {
          code: 'HTML_RESPONSE', status: response.status, retryable: true,
        });
      }

      let payload;
      try {
        payload = JSON.parse(body);
      } catch (_) {
        throw new AthleticNetApiError('Athletic.net returned invalid JSON', {
          code: 'INVALID_JSON', status: response.status, retryable: true,
        });
      }
      return validateSearchPayload(payload);
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new AthleticNetApiError('Athletic.net request timed out', {
          code: 'TIMEOUT', retryable: true,
        });
      }
      if (error instanceof AthleticNetApiError) throw error;
      throw new AthleticNetApiError(error?.message || 'Athletic.net request failed', {
        code: 'NETWORK_ERROR', retryable: true,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async search(query, { sport = 'tf' } = {}) {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) return { response: { docs: [] } };

    const key = this.cacheKey(normalizedQuery, sport);
    if (this.cache.has(key)) return this.cache.get(key);

    const url = `${this.endpoint}?q=${encodeURIComponent(normalizedQuery)}&sport=${encodeURIComponent(sport)}`;
    let lastError = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        await this.waitForRequestSlot();
        const payload = await this.request(url);
        this.cache.set(key, payload);
        return payload;
      } catch (error) {
        lastError = error;
        if (!error.retryable || attempt >= this.maxRetries) throw error;
        const backoff = this.retryBackoffMs * (2 ** attempt);
        const retryDelay = error.code === 'RATE_LIMITED'
          ? (error.retryAfterMs ?? 60000)
          : backoff;
        await this.sleepImpl(retryDelay);
      }
    }
    throw lastError || new AthleticNetApiError('Athletic.net search failed');
  }
}

module.exports = {
  AthleticNetApiError,
  AthleticNetSearchClient,
  DEFAULT_ENDPOINT,
  isHtmlResponse,
  validateSearchPayload,
};
