/**
 * Typed environment variable access with defaults.
 * All test code should read credentials/URLs from here — never hardcode them.
 */
export const Env = {
  baseUrl: process.env.BASE_URL || 'https://the-internet.herokuapp.com',
  username: process.env.APP_USERNAME || (() => { throw new Error('APP_USERNAME is not set'); })(),
  password: process.env.APP_PASSWORD || (() => { throw new Error('APP_PASSWORD is not set'); })(),
  headless: process.env.HEADLESS !== 'false',
  isCI: process.env.CI === 'true',

  /** Throw if a required variable is missing */
  require(key: string): string {
    const val = process.env[key];
    if (!val) throw new Error(`Required environment variable "${key}" is not set`);
    return val;
  },
} as const;
