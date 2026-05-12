import { Logger } from '../utils/Logger';

export class SafetyCheckEngine {
  // Rules defined as methods and called explicitly — avoids `this` being undefined
  // in static array initializers (a known JS class pitfall)
  static shouldRejectHeal(healProposal: HealProposal): { reject: boolean; reasons: string[] } {
    const rejectionReasons: string[] = [];

    const checks: Array<[() => boolean, string]> = [
      // Rule 1: only block non-semantic clickable divs/spans for assertVisible
      // getByRole('button',...) on assertVisible IS valid — asserting a button exists
      [
        () =>
          healProposal.action === 'assertVisible' &&
          /div\[onclick\]|span\[onclick\]/.test(healProposal.locator),
        'Non-semantic clickable element for assertion',
      ],
      [
        () => healProposal.action === 'click' && this.isHiddenElement(healProposal.locator),
        'Clicking hidden element',
      ],
      [
        () => this.contextDistance(healProposal.originalContext, healProposal.newContext) > 0.3,
        'Context mismatch too large',
      ],
      [() => this.calculateRiskScore(healProposal.locator) > 0.7, 'Risk score too high'],
      [() => this.detectSuspiciousPattern(healProposal.locator), 'Suspicious pattern detected'],
      [() => this.detectSecurityRisk(healProposal.locator), 'Security risk detected'],
      [
        () => this.detectAccessibilityIssue(healProposal.locator, healProposal.action),
        'Accessibility violation',
      ],
    ];

    for (const [check, reason] of checks) {
      try {
        if (check()) rejectionReasons.push(reason);
      } catch (error) {
        Logger.warn('Safety rule evaluation failed', error);
      }
    }

    return { reject: rejectionReasons.length > 0, reasons: rejectionReasons };
  }

  private static isInteractiveElement(locator: string): boolean {
    const interactivePatterns = [
      /button/i,
      /a\[/i,
      /input/i,
      /select/i,
      /textarea/i,
      /\[role="button"]/i,
      /\[role="link"]/i,
      /\[onclick\]/i,
    ];

    return interactivePatterns.some((pattern) => pattern.test(locator));
  }

  private static isHiddenElement(locator: string): boolean {
    const hiddenPatterns = [
      /\[type="hidden"]/i,
      /\[hidden\]/i,
      /display:\s*none/i,
      /visibility:\s*hidden/i,
      /opacity:\s*0/i,
    ];

    return hiddenPatterns.some((pattern) => pattern.test(locator));
  }

  private static contextDistance(
    original: { action: string; elementType: string },
    proposed: { action: string; elementType: string }
  ): number {
    // Calculate context similarity distance (0-1)
    // 0 = identical, 1 = completely different

    let differences = 0;
    let totalFactors = 0;

    if (original.action !== proposed.action) differences++;
    totalFactors++;

    if (original.elementType !== proposed.elementType) differences++;
    totalFactors++;

    // Add more context comparison factors

    return differences / totalFactors;
  }

  private static calculateRiskScore(locator: string): number {
    let risk = 0;

    if (this.hasSecurityRisk(locator)) risk += 0.4;
    if (this.hasNavigationRisk(locator)) risk += 0.3;
    if (this.hasComplexityRisk(locator)) risk += 0.2;
    if (this.hasUncertaintyRisk(locator)) risk += 0.1;

    return Math.min(1, risk);
  }

  private static detectSuspiciousPattern(locator: string): boolean {
    const suspiciousPatterns = [
      // Removed: /\/\/.+\/\// — this matches valid XPath like //div//input
      /\[.*\].*\[.*\]/, // Multiple attribute brackets (unusual)
      /:not\(.*:not/, // Nested :not
      /\*\*/, // Double asterisks
      /\$\$/, // Double dollars
      /\|\|/, // Double pipes
    ];
    return suspiciousPatterns.some((pattern) => pattern.test(locator));
  }

  private static detectSecurityRisk(locator: string): boolean {
    const securityPatterns = [
      /javascript:/i,
      /data:/i,
      /vbscript:/i,
      /expression\(/i,
      /eval\(/i,
      /on\w+\s*=/i,
    ];

    return securityPatterns.some((pattern) => pattern.test(locator));
  }

  private static detectAccessibilityIssue(locator: string, action: string): boolean {
    // Only block non-semantic clickable divs/spans for assertions
    // assertVisible on a button/link IS valid — we're asserting it exists
    const a11yAntiPatterns = [
      /\[tabindex="-1"]/,
      /div\[onclick\]/,
      /span\[onclick\]/,
      /\[role="presentation"]/,
    ];

    return a11yAntiPatterns.some((pattern) => pattern.test(locator));
  }

  private static hasNavigationRisk(locator: string): boolean {
    // Only block actual JS navigation patterns — not CSS selectors with 'navigation' in name
    // Removed: /navigation/i, /redirect/i, /href=/i — these match valid locators
    return /window\.location|window\.open|document\.location/i.test(locator);
  }

  private static hasSecurityRisk(locator: string): boolean {
    return /javascript:|data:|eval\(|on\w+\s*=/i.test(locator);
  }

  private static hasComplexityRisk(locator: string): boolean {
    return locator.split(' ').length > 5 || locator.includes('//') || locator.length > 100;
  }

  private static hasUncertaintyRisk(locator: string): boolean {
    const uncertaintyPatterns = [
      /\*/, // Wildcards
      /\[.*\*.*\]/, // Contains wildcards
      /:contains/, // Text contains
      /~=/, // Contains word
      /\|=/, // Starts with
    ];

    return uncertaintyPatterns.some((pattern) => pattern.test(locator));
  }
}

interface HealContext {
  originalContext: { action: string; elementType: string };
  newContext: { action: string; elementType: string };
}

interface HealProposal {
  locator: string;
  action: string;
  originalContext: HealContext['originalContext'];
  newContext: HealContext['newContext'];
}
