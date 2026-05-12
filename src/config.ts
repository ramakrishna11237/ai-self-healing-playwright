export interface Config {
  maxRetries: number;
  stepRetries: number;
  timeout: number;
  waitTimeout: number;
  strategyTimeout: number;
  enableBackoff: boolean;
  maxBackoffMs: number;
  learningEnabled: boolean;
  llmEnabled: boolean;
  llmModel: string;
  llmTimeoutMs: number;
  llmMinConfidence: number;
  llmFallbackModel: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  screenshotDir: string;
  downloadDir: string;
  diffDir: string;
  dbPath: string;
  logDir: string;
  slowTypeDelay: number;
  iframeTimeout: number;
  /** Auto-patch page object files when AutonomousDiagnostics finds a fix. Default: false */
  autoPatch: boolean;
  /** Worker index — auto-patch only runs on worker 0 to prevent parallel file corruption */
  workerIndex: number;
}

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? parseInt(v, 10) : fallback;
}

function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return v !== 'false' && v !== '0';
}

export const DEFAULT_CONFIG: Config = {
  maxRetries: envInt('FW_MAX_RETRIES', 3),
  stepRetries: envInt('FW_STEP_RETRIES', 2),
  timeout: envInt('FW_TIMEOUT', 5000),
  waitTimeout: envInt('FW_WAIT_TIMEOUT', 5000),
  strategyTimeout: envInt('FW_STRATEGY_TIMEOUT', 1000),
  enableBackoff: envBool('FW_BACKOFF', true),
  maxBackoffMs: envInt('FW_MAX_BACKOFF_MS', 2000),
  iframeTimeout: envInt('FW_IFRAME_TIMEOUT', 10000),
  slowTypeDelay: envInt('FW_SLOW_TYPE_MS', 80),
  learningEnabled: envBool('FW_LEARNING', true),
  llmEnabled: envBool('FW_LLM', false),
  llmModel: env('FW_LLM_MODEL', 'llama3'),
  llmTimeoutMs: envInt('FW_LLM_TIMEOUT_MS', 8000),
  llmMinConfidence: envInt('FW_LLM_MIN_CONFIDENCE', 70),
  llmFallbackModel: env('FW_LLM_FALLBACK_MODEL', 'codellama'),
  dbPath: env('FW_DB_PATH', 'learning-db.json'),
  logLevel: env('FW_LOG_LEVEL', 'info') as Config['logLevel'],
  screenshotDir: env('FW_SCREENSHOT_DIR', 'test-results/screenshots'),
  downloadDir: env('FW_DOWNLOAD_DIR', 'test-results/downloads'),
  diffDir: env('FW_DIFF_DIR', 'test-results/diffs'),
  logDir: env('FW_LOG_DIR', 'test-results/logs'),
  // Auto-patch disabled by default — enable with FW_AUTO_PATCH=true
  // Only runs on worker 0 to prevent parallel file corruption
  autoPatch: envBool('FW_AUTO_PATCH', false),
  workerIndex: envInt('PLAYWRIGHT_WORKER_INDEX', 0), // Playwright sets this automatically
};
