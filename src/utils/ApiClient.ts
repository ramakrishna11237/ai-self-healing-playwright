import * as https from 'https';
import * as http from 'http';
import { Logger } from './Logger';

export interface ApiRequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  ignoreSSL?: boolean;
}

export interface ApiResponse<T = unknown> {
  status: number;
  ok: boolean;
  body: T;
  headers: Record<string, string>;
  durationMs: number;
}

/**
 * ApiClient — lightweight HTTP client for API testing and test data setup.
 *
 * Equivalent to Playwright's `request` fixture and Cypress `cy.request()`.
 * Use this to:
 *   - Create test data via API instead of slow UI flows
 *   - Assert API responses directly
 *   - Set up preconditions before UI tests
 *   - Tear down test data after tests
 *
 * @example
 *   const record = await api.post<{ id: string }>("/employees", { name: "John Smith" });
 *   Logger.info(`Created record: ${record.body.id}`);
 */
export class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private authToken?: string;

  constructor(baseUrl: string, defaultHeaders: Record<string, string> = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...defaultHeaders,
    };
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  /** Authenticate and store token for subsequent requests */
  async authenticate(
    loginPath: string,
    credentials: { username: string; password: string },
    tokenPath = 'token'
  ): Promise<void> {
    const res = await this.post<Record<string, unknown>>(loginPath, credentials);
    if (!res.ok) throw new Error(`Authentication failed: ${res.status}`);
    // Extract token from nested path like "data.token" or flat "token"
    const parts = tokenPath.split('.');
    let val: unknown = res.body;
    for (const part of parts) {
      val = (val as Record<string, unknown>)?.[part];
    }
    if (typeof val === 'string') {
      this.authToken = val;
      this.defaultHeaders['Authorization'] = `Bearer ${val}`;
      Logger.debug('ApiClient: authenticated successfully');
    } else {
      Logger.warn(`ApiClient: token not found at path "${tokenPath}"`);
    }
  }

  /** Set a bearer token directly */
  setBearerToken(token: string): void {
    this.authToken = token;
    this.defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  /** Set a cookie header directly */
  setCookie(cookie: string): void {
    this.defaultHeaders['Cookie'] = cookie;
  }

  // ── HTTP methods ────────────────────────────────────────────────────────────

  async get<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path, options);
  }

  async post<T = unknown>(
    path: string,
    body?: unknown,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, { ...options, body });
  }

  async put<T = unknown>(
    path: string,
    body?: unknown,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, { ...options, body });
  }

  async patch<T = unknown>(
    path: string,
    body?: unknown,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', path, { ...options, body });
  }

  async delete<T = unknown>(
    path: string,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path, options);
  }

  // ── Assertions ──────────────────────────────────────────────────────────────

  /** Assert response status — throws with clear message on mismatch */
  assertStatus(res: ApiResponse, expected: number): void {
    if (res.status !== expected) {
      throw new Error(`API assertion failed: expected status ${expected}, got ${res.status}`);
    }
  }

  /** Assert response body contains a key with expected value */
  assertBody(res: ApiResponse<Record<string, unknown>>, key: string, expected: unknown): void {
    const actual = res.body[key];
    if (actual !== expected) {
      throw new Error(`API assertion failed: body.${key} expected "${expected}", got "${actual}"`);
    }
  }

  /** Assert response was successful (2xx) */
  assertOk(res: ApiResponse): void {
    if (!res.ok) {
      throw new Error(`API assertion failed: expected 2xx status, got ${res.status}`);
    }
  }

  // ── Core request ────────────────────────────────────────────────────────────

  private request<T>(
    method: string,
    urlPath: string,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const url = urlPath.startsWith('http') ? urlPath : `${this.baseUrl}${urlPath}`;
    const timeout = options.timeout ?? 30000;
    const headers = { ...this.defaultHeaders, ...(options.headers ?? {}) };
    const bodyStr = options.body !== undefined ? JSON.stringify(options.body) : undefined;

    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr).toString();

    // SSRF guard — only allow http/https and block private/loopback ranges
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return Promise.reject(new Error(`ApiClient: invalid URL "${url}"`));
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return Promise.reject(new Error(`ApiClient: blocked non-http protocol "${parsed.protocol}"`));
    }
    const hostname = parsed.hostname.toLowerCase();
    // Strip IPv6 brackets for matching
    const rawHost = hostname.replace(/^\[|\]$/g, '');
    const BLOCKED =
      /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|::1$|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|fe80:)/;
    const isCI = process.env['CI'] === 'true';
    const allowInternal = process.env['ALLOW_INTERNAL_HOSTS'] === 'true' && !isCI;
    if (BLOCKED.test(rawHost) && !allowInternal) {
      return Promise.reject(
        new Error(
          `ApiClient: blocked internal host "${hostname}" — set ALLOW_INTERNAL_HOSTS=true (non-CI only) to override`
        )
      );
    }

    const startMs = Date.now();

    return new Promise((resolve, reject) => {
      const isHttps = parsed.protocol === 'https:';
      const lib = isHttps ? https : http;
      // SSL: never disable certificate validation in production
      // ignoreSSL is only permitted when explicitly set AND not in CI
      const allowIgnoreSSL = (options.ignoreSSL ?? false) && !isCI;
      if (allowIgnoreSSL) {
        Logger.warn('ApiClient: SSL certificate validation disabled — do not use in production');
      }
      const reqOpts = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method,
        headers,
        timeout,
        rejectUnauthorized: !allowIgnoreSSL,
      };

      const req = lib.request(reqOpts, (res) => {
        let raw = '';
        res.on('data', (chunk: Buffer) => {
          raw += chunk.toString();
        });
        res.on('end', () => {
          const durationMs = Date.now() - startMs;
          let body: T;
          try {
            body = JSON.parse(raw) as T;
          } catch {
            body = raw as unknown as T;
          }
          const status = res.statusCode ?? 0;
          const resHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === 'string') resHeaders[k] = v;
            else if (Array.isArray(v)) resHeaders[k] = v.join(', ');
          }
          Logger.debug(`API ${method} ${url} → ${status} (${durationMs}ms)`);
          resolve({
            status,
            ok: status >= 200 && status < 300,
            body,
            headers: resHeaders,
            durationMs,
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`API request timeout: ${method} ${url}`));
      });
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }
}
