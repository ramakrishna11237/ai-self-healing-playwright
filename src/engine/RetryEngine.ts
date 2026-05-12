import { Logger } from '../utils/Logger';
import { DEFAULT_CONFIG } from '../config';

// Errors that should NOT be retried — retrying them wastes time because
// they indicate the element genuinely doesn't exist or the page is broken.
const NON_RETRYABLE_PATTERNS = [
  'Timeout',
  'TimeoutError',
  'Target closed',
  'Navigation failed',
  'net::ERR_',
  'ERR_INTERNET_DISCONNECTED',
];

function isRetryable(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return !NON_RETRYABLE_PATTERNS.some((p) => msg.includes(p));
}

export async function retryAction<T>(fn: () => Promise<T>, retries?: number): Promise<T> {
  const maxRetries = retries ?? DEFAULT_CONFIG.maxRetries;
  let lastError: unknown;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await fn();
      if (i > 0) Logger.debug(`Retry succeeded on attempt ${i + 1}/${maxRetries}`);
      return result;
    } catch (e) {
      lastError = e;

      // Don't retry non-retryable errors — fail fast
      if (!isRetryable(e)) {
        Logger.debug(`Non-retryable error — skipping remaining retries: ${String(e)}`);
        break;
      }

      if (i < maxRetries - 1) {
        const base = DEFAULT_CONFIG.enableBackoff ? Math.pow(2, i) * 100 : 100;
        const jitter = Math.floor(Math.random() * 50);
        const delay = Math.min(base + jitter, DEFAULT_CONFIG.maxBackoffMs);
        Logger.debug(`Retry ${i + 1}/${maxRetries} failed, next in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  Logger.error(`All ${maxRetries} retry attempts failed: ${msg}`);
  throw new Error(`retryAction failed after ${maxRetries} attempts: ${msg}`);
}
