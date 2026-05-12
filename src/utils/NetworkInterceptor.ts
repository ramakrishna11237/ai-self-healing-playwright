import { Page, Route, Request } from '@playwright/test';
import { Logger } from '../utils/Logger';

export interface MockResponse {
  status?: number;
  contentType?: string;
  body?: string | object;
  headers?: Record<string, string>;
}

export interface InterceptRule {
  pattern: string | RegExp;
  action: 'mock' | 'block' | 'modify' | 'observe';
  response?: MockResponse;
  modifier?: (route: Route, request: Request) => Promise<void>;
}

export class NetworkInterceptor {
  private rules: InterceptRule[] = [];
  private observedRequests: Array<{ url: string; method: string; timestamp: number }> = [];
  private active = false;

  constructor(private page: Page) {}

  /** Mock a URL pattern with a fixed response */
  mock(pattern: string | RegExp, response: MockResponse): this {
    this.rules.push({ pattern, action: 'mock', response });
    return this;
  }

  /** Block all requests matching a pattern */
  block(pattern: string | RegExp): this {
    this.rules.push({ pattern, action: 'block' });
    return this;
  }

  /** Observe requests matching a pattern (log only, don't intercept) */
  observe(pattern: string | RegExp): this {
    this.rules.push({ pattern, action: 'observe' });
    return this;
  }

  /** Custom modifier — full control over route */
  modify(
    pattern: string | RegExp,
    modifier: (route: Route, request: Request) => Promise<void>
  ): this {
    this.rules.push({ pattern, action: 'modify', modifier });
    return this;
  }

  /** Activate all registered rules */
  async activate(): Promise<void> {
    if (this.active) return;
    this.active = true;

    await this.page.route('**/*', async (route, request) => {
      const url = request.url();

      for (const rule of this.rules) {
        const matches =
          typeof rule.pattern === 'string' ? url.includes(rule.pattern) : rule.pattern.test(url);

        if (!matches) continue;

        if (rule.action === 'block') {
          Logger.debug(`[Network] Blocked: ${url}`);
          await route.abort();
          return;
        }

        if (rule.action === 'mock' && rule.response) {
          const {
            status = 200,
            contentType = 'application/json',
            body = {},
            headers = {},
          } = rule.response;
          const safeStatus =
            Number.isInteger(status) && status >= 100 && status <= 599 ? status : 200;
          const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
          // Sanitize headers — strip any header containing newlines (CWE-113 header injection)
          const safeHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(headers)) {
            if (
              typeof k === 'string' &&
              typeof v === 'string' &&
              !/[\r\n]/.test(k) &&
              !/[\r\n]/.test(v)
            ) {
              safeHeaders[k] = v;
            }
          }
          Logger.debug(`[Network] Mocked: ${url} → ${safeStatus}`);
          await route.fulfill({
            status: safeStatus,
            contentType,
            body: bodyStr,
            headers: safeHeaders,
          });
          return;
        }

        if (rule.action === 'modify' && rule.modifier) {
          Logger.debug(`[Network] Modified: ${url}`);
          await rule.modifier(route, request);
          return;
        }

        if (rule.action === 'observe') {
          this.observedRequests.push({ url, method: request.method(), timestamp: Date.now() });
          Logger.debug(`[Network] Observed: ${request.method()} ${url}`);
        }
      }

      await route.continue();
    });

    Logger.info(`NetworkInterceptor activated with ${this.rules.length} rules`);
  }

  /** Deactivate all interception */
  async deactivate(): Promise<void> {
    await this.page.unrouteAll();
    this.active = false;
    Logger.info('NetworkInterceptor deactivated');
  }

  /** Wait for a request matching a pattern to be made */
  async waitForRequest(pattern: string | RegExp, timeout = 10000): Promise<Request> {
    return this.page.waitForRequest(pattern, { timeout });
  }

  /** Wait for a response matching a pattern */
  async waitForResponse(pattern: string | RegExp, timeout = 10000) {
    return this.page.waitForResponse(pattern, { timeout });
  }

  getObservedRequests() {
    return [...this.observedRequests];
  }

  clearObserved(): void {
    this.observedRequests = [];
  }
}
