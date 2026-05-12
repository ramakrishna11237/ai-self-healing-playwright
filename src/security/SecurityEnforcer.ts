import { Page } from '@playwright/test';
import { Logger } from '../utils/Logger';

export interface SecurityScanResult {
  safe: boolean;
  risks: string[];
  recommendations?: string[];
}

export class SecurityEnforcer {
  private static readonly FORBIDDEN_PATTERNS = [
    /eval\(/i,
    /Function\(/i,
    /setTimeout\(/i,
    /setInterval\(/i,
    /script/i,
    /javascript:/i,
    /data:/i,
    /on\w+\s*=/i,
    /expression\(/i,
    /import\(/i,
    /require\(/i,
    /new\s+Function/i,
    /\\.\s*constructor/i,
  ];

  private static readonly ALLOWED_CSS_PROPERTIES = new Set([
    'color',
    'background-color',
    'font-size',
    'font-family',
    'width',
    'height',
    'padding',
    'margin',
    'border',
    'display',
    'position',
    'top',
    'left',
    'right',
    'bottom',
    'opacity',
    'visibility',
    'z-index',
    'flex',
    'grid',
    'align-items',
    'justify-content',
    'text-align',
    'cursor',
    'overflow',
    'transition',
    'transform',
  ]);

  private static readonly ALLOWED_PERFORMANCE_METRICS = new Set([
    'pageLoad',
    'domLoad',
    'TTFB',
    'FCP',
    'LCP',
    'CLS',
    'TTI',
    'FID',
    'INP',
  ]);

  static scanLocator(locator: string): SecurityScanResult {
    const risks: string[] = [];

    if (!locator || typeof locator !== 'string') {
      return { safe: false, risks: ['Empty or invalid locator'] };
    }

    // Length validation
    if (locator.length > 500) {
      risks.push('Locator too long (potential DoS)');
    }

    // Pattern validation
    this.FORBIDDEN_PATTERNS.forEach((pattern) => {
      if (pattern.test(locator)) {
        risks.push(`Contains forbidden pattern: ${pattern.source}`);
      }
    });

    // Template literal injection
    if (locator.includes('${') || locator.includes('`')) {
      risks.push('Potential template literal injection');
    }

    // Comment injection
    if (locator.includes('//') || locator.includes('/*')) {
      risks.push('Potential comment-based injection');
    }

    // Escape sequence injection
    if (locator.includes('\\')) {
      risks.push('Potential escape sequence injection');
    }

    return {
      safe: risks.length === 0,
      risks,
      recommendations: risks.length > 0 ? ['Use SecurityEnforcer.sanitizeLocator()'] : undefined,
    };
  }

  static sanitizeLocator(locator: string): string {
    if (!locator) return '';

    // Remove null bytes and control characters
    let safe = locator.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

    // Limit length
    safe = safe.slice(0, 500);

    // Escape dangerous characters
    safe = safe.replace(/[\\`$]/g, '\\$&');

    // Remove suspicious patterns
    this.FORBIDDEN_PATTERNS.forEach((pattern) => {
      safe = safe.replace(pattern, '');
    });

    // Remove comments
    safe = safe.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

    return safe;
  }

  static validateCssProperty(property: string): boolean {
    if (!property || typeof property !== 'string') return false;

    // Basic format validation
    if (!/^[a-zA-Z-]+$/.test(property)) return false;

    // Allowlist validation
    return this.ALLOWED_CSS_PROPERTIES.has(property);
  }

  static validatePerformanceMetric(metric: string): boolean {
    if (!metric || typeof metric !== 'string') return false;
    return this.ALLOWED_PERFORMANCE_METRICS.has(metric);
  }

  static async safeEvaluate<T>(
    page: Page,
    fn: (...args: unknown[]) => T,
    ...args: unknown[]
  ): Promise<T> {
    // Validate function is actually a function, not a string
    if (typeof fn !== 'function') {
      throw new Error('safeEvaluate: Function required, string evaluation blocked (CWE-95)');
    }

    // Validate arguments don't contain dangerous patterns
    for (const arg of args) {
      if (typeof arg === 'string') {
        const scan = this.scanLocator(arg);
        if (!scan.safe) {
          throw new Error(`safeEvaluate: Dangerous argument detected - ${scan.risks.join(', ')}`);
        }
      }
    }

    return page.evaluate(fn as (...args: unknown[]) => T, args.length === 1 ? args[0] : args);
  }

  static scanAction(action: string): SecurityScanResult {
    const risks: string[] = [];

    const dangerousActions = new Set([
      'executeScript',
      'executeAsyncScript',
      'evaluate',
      'evaluateHandle',
    ]);

    if (dangerousActions.has(action)) {
      risks.push(`Action '${action}' requires special security handling`);
    }

    return {
      safe: risks.length === 0,
      risks,
    };
  }

  static validateUrl(url: string): boolean {
    if (!url) return false;

    try {
      const parsed = new URL(url);
      // Only allow http and https protocols
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
      }

      // Additional security checks can be added here
      return true;
    } catch {
      return false;
    }
  }

  static logSecurityEvent(event: string, details: Record<string, unknown> = {}): void {
    Logger.warn(`SECURITY: ${event}`, {
      timestamp: new Date().toISOString(),
      ...details,
      securityScan: 'CWE-95 prevention',
    });
  }
}
