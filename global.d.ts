// Global type definitions for Playwright TypeScript framework

/// <reference types="@playwright/test" />

// Extend Playwright types if needed
declare namespace Playwright {
  interface Page {
    // Add any custom page methods here
  }

  interface BrowserContext {
    // Add any custom context methods here
  }
}

// Global test environment variables
declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    FW_HUMAN_VERIFICATION: string;
    FW_SANDBOX_EXECUTION: string;
    FW_TRUSTED_MODE: string;
    FW_VERIFICATION_TIMEOUT_MS: string;
    FW_MAX_SANDBOX_TIME_MS: string;
    FW_ALLOWED_DOM_CHANGES: string;
    PLAYWRIGHT_WORKER_INDEX: string;
    CI: string;
  }
}