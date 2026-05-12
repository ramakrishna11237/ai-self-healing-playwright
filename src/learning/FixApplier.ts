import { Logger } from '../utils/Logger';
import { DEFAULT_CONFIG } from '../config';
import { getAllFixes } from './LearningStore';

export function getBestLocator(oldLocator?: string, action = 'click'): string | undefined {
  return getBestLocatorWithScore(oldLocator, action)?.locator;
}

/**
 * Returns the best locator AND its confidence score.
 * Used by Runner Layer 3 to record confidence in StepResult.
 */
export function getBestLocatorWithScore(
  oldLocator?: string,
  action = 'click'
): { locator: string; confidence: number } | undefined {
  if (!oldLocator || !DEFAULT_CONFIG.learningEnabled) return undefined;

  try {
    const db = getAllFixes();

    const exactMatch = db
      .filter((x) => x.old === oldLocator && x.success && x.action === action)
      .sort(
        (a, b) =>
          (b.confidence ?? 0) - (a.confidence ?? 0) ||
          b.count - a.count ||
          b.timestamp - a.timestamp
      )[0];

    if (exactMatch) {
      Logger.debug('Learned fix (exact action match)', {
        from: oldLocator,
        to: exactMatch.new,
        action,
        uses: exactMatch.count,
        confidence: exactMatch.confidence ?? 'n/a',
      });
      return { locator: exactMatch.new, confidence: exactMatch.confidence ?? 0 };
    }
    // No exact action match — do not fall back to wrong action type
    // Layer 4 DOM heal handles this case correctly
  } catch (e) {
    Logger.error('getBestLocatorWithScore failed', e);
  }

  return undefined;
}
