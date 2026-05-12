import { Step } from '../types';
import { getAllFixes } from '../learning/LearningStore';

interface StepContext {
  action: string | undefined;
  label: string | undefined;
  text: string | undefined;
  locator: string | undefined;
}

interface LocatorContext {
  elementType: string;
  complexity: number;
  specificity: number;
}

export interface ConfidenceScore {
  overall: number;
  components: {
    base: number;
    risk: number;
    context: number;
    history: number;
  };
  thresholds: {
    layer1: number;
    layer2: number;
    layer3: number;
    layer3_5: number;
    layer4: number;
    layer5: number;
    layer6: number;
    layer7: number;
  };
}

export class QuantumConfidenceSystem {
  private static readonly CONFIDENCE_THRESHOLDS = {
    layer1: 99.99, // Pattern recognition — direct execution
    layer2: 99.9, // Smart locator — confidence-scored
    layer3: 99.5, // Learned fixes — previously verified
    layer3_5: 98.0, // AI label prediction
    layer4: 70.0, // DOM analysis — realistic threshold (was 99.0, blocked everything)
    layer5: 65.0, // AI full context (was 97.0)
    layer6: 100.0, // Human verification
    layer7: 100.0, // Safe execution
  };

  static calculateCompositeConfidence(
    healProposal: HealProposal,
    context: HealContext
  ): ConfidenceScore {
    const baseConfidence = this.calculateBaseConfidence(healProposal);
    const riskFactor = this.calculateRiskFactor(healProposal, context);
    const contextScore = this.calculateContextScore(healProposal, context);
    const historyScore = this.calculateHistoryScore(healProposal);

    // Weighted composite score with extreme safety
    const overall = Math.min(
      100,
      baseConfidence * 0.4 + riskFactor * 0.3 + contextScore * 0.2 + historyScore * 0.1
    );

    return {
      overall,
      components: {
        base: baseConfidence,
        risk: riskFactor,
        context: contextScore,
        history: historyScore,
      },
      thresholds: { ...this.CONFIDENCE_THRESHOLDS },
    };
  }

  static isAcceptable(confidence: number, layer: string): boolean {
    return (
      confidence >= this.CONFIDENCE_THRESHOLDS[layer as keyof typeof this.CONFIDENCE_THRESHOLDS]
    );
  }

  private static calculateBaseConfidence(healProposal: HealProposal): number {
    const { locator } = healProposal;

    const strategyConfidence: Record<string, number> = {
      'data-testid': 99.9,
      'aria-label': 99.0,
      getByRole: 98.0,
      getByLabel: 97.0,
      name: 96.0,
      placeholder: 95.0,
      text: 94.0,
      title: 93.0,
      pierce: 92.0,
      default: 90.0,
    };

    // Find the best matching strategy
    let bestMatch = 'default';
    for (const [key] of Object.entries(strategyConfidence)) {
      if (locator.includes(key)) {
        bestMatch = key;
        break;
      }
    }

    return strategyConfidence[bestMatch];
  }

  private static calculateRiskFactor(healProposal: HealProposal, context: HealContext): number {
    let riskScore = 100; // Start with perfect score

    // Penalize based on risk factors
    if (this.hasSecurityRisk(healProposal.locator)) {
      riskScore -= 40;
    }

    if (this.hasNavigationRisk(healProposal.locator, context.action)) {
      riskScore -= 30;
    }

    if (this.hasDestructiveRisk(healProposal.locator, context.action)) {
      riskScore -= 35;
    }

    if (this.hasComplexityRisk(healProposal.locator)) {
      riskScore -= 20;
    }

    return Math.max(0, riskScore);
  }

  private static calculateContextScore(healProposal: HealProposal, context: HealContext): number {
    const originalContext = this.extractContext(context.originalStep);
    const newContext = this.analyzeContext(healProposal.locator);

    const similarity = this.calculateContextSimilarity(originalContext, newContext);

    // Convert similarity (0-1) to percentage (0-100)
    return Math.min(100, similarity * 100);
  }

  private static calculateHistoryScore(healProposal: HealProposal): number {
    // Implement history-based scoring
    // This would integrate with your learning database

    const history = this.getHealingHistory(healProposal);

    if (history.successRate > 0.95) {
      return 100;
    } else if (history.successRate > 0.8) {
      return 80;
    } else if (history.successRate > 0.5) {
      return 50;
    }

    return 20; // Default for unknown history
  }

  private static hasSecurityRisk(locator: string): boolean {
    const securityPatterns = [
      /script/i,
      /javascript:/i,
      /data:/i,
      /on\w+=/i,
      /eval/i,
      /expression/i,
    ];

    return securityPatterns.some((pattern) => pattern.test(locator));
  }

  private static hasNavigationRisk(locator: string, action: string): boolean {
    if (action === 'goto' || action === 'goBack' || action === 'goForward') {
      return false; // Expected navigation
    }

    const navigationPatterns = [
      /href=/i,
      /window\.location/i,
      /window\.open/i,
      /document\.location/i,
    ];

    return navigationPatterns.some((pattern) => pattern.test(locator));
  }

  private static hasDestructiveRisk(locator: string, action: string): boolean {
    const destructiveActions = new Set(['delete', 'remove', 'clear', 'reset']);

    if (destructiveActions.has(action)) {
      return true;
    }

    const destructivePatterns = [/delete/i, /remove/i, /clear/i, /reset/i, /destroy/i];

    return destructivePatterns.some((pattern) => pattern.test(locator));
  }

  private static hasComplexityRisk(locator: string): boolean {
    // Complex locators are riskier
    const complexityFactors = [
      locator.split(' ').length > 5, // Too many parts
      locator.includes('//'), // XPath
      locator.includes(':has'), // Complex CSS
      locator.includes('>>'), // Chained locators
      locator.length > 100, // Very long locator
    ];

    return complexityFactors.some((factor) => factor);
  }

  private static extractContext(step: Step): StepContext {
    return {
      action: step.action,
      label: step.label,
      text: step.text,
      locator: step.locator || step.codegenLocator,
    };
  }

  private static analyzeContext(locator: string): LocatorContext {
    return {
      elementType: this.guessElementType(locator),
      complexity: this.calculateComplexity(locator),
      specificity: this.calculateSpecificity(locator),
    };
  }

  private static calculateContextSimilarity(
    original: StepContext,
    proposed: LocatorContext
  ): number {
    let similarity = 0;

    if (
      original.locator &&
      proposed.elementType === this.guessElementType(original.locator ?? '')
    ) {
      similarity += 0.3;
    }

    if (
      this.contextsMatch(
        original as unknown as Record<string, unknown>,
        proposed as unknown as Record<string, unknown>,
        0.7
      )
    ) {
      similarity += 0.4;
    }

    return Math.min(1, similarity);
  }

  // ... helper methods ...

  private static getHealingHistory(healProposal: HealProposal): { successRate: number } {
    // Wire to LearningStore — real history from learning-db
    try {
      const fixes = getAllFixes();
      const matched = fixes.filter((f) => f.new === healProposal.locator);
      const success = matched.filter((f) => f.success);
      if (matched.length === 0) return { successRate: 0.5 }; // unknown — neutral
      return { successRate: success.length / matched.length };
    } catch {
      return { successRate: 0.5 };
    }
  }

  private static guessElementType(locator: string): string {
    if (/button/i.test(locator)) return 'button';
    if (/input/i.test(locator)) return 'input';
    if (/select/i.test(locator)) return 'select';
    if (/textarea/i.test(locator)) return 'textarea';
    if (/^a[\s]/i.test(locator)) return 'link';
    return 'unknown';
  }

  private static calculateComplexity(locator: string): number {
    return locator.split(' ').length + (locator.match(/\[/g)?.length ?? 0);
  }

  private static calculateSpecificity(locator: string): number {
    if (locator.includes('data-testid')) return 100;
    if (locator.includes('aria-label')) return 90;
    if (locator.startsWith('getByRole')) return 85;
    if (locator.startsWith('#')) return 80;
    return 50;
  }

  private static contextsMatch(
    a: Record<string, unknown>,
    b: Record<string, unknown>,
    threshold: number
  ): boolean {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let matches = 0;
    for (const k of keys) {
      if (a[k] === b[k]) matches++;
    }
    return keys.size > 0 && matches / keys.size >= threshold;
  }
}

interface HealProposal {
  locator: string;
  strategy: string;
  confidence: number;
  action: string;
}

interface HealContext {
  originalStep: Step;
  action: string;
  layer: string;
}
