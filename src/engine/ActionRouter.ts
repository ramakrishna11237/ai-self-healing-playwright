import { Page } from '@playwright/test';
import { Step, ActionType } from '../types';
import { Logger } from '../utils/Logger';
import { handleNavigationAction } from './actions/NavigationActions';
import { handleMouseAction } from './actions/MouseActions';
import { handleKeyboardAction } from './actions/KeyboardActions';
import { handleFormAction } from './actions/FormActions';
import { handleAssertionAction } from './actions/AssertionActions';
import { handleWaitAction } from './actions/WaitActions';
import { handleAdvancedAction } from './actions/AdvancedActions';
import { handleExtendedAction } from './ActionRouterExtensions';
import { handleExtendedAction2 } from './ActionRouterExtensions2';

// Re-export locator utilities so other modules keep their existing imports
export { resolveLocatorToPlaywright } from './actions/locatorUtils';

// ── Plugin registry ───────────────────────────────────────────────────────────
type PluginHandler = (page: Page, step: Step) => Promise<boolean>;
const pluginRegistry = new Map<string, PluginHandler>();

export function registerAction(name: string, handler: PluginHandler): void {
  pluginRegistry.set(name, handler);
  Logger.debug(`Plugin registered: action "${name}"`);
}

export function unregisterAction(name: string): void {
  pluginRegistry.delete(name);
  Logger.debug(`Plugin unregistered: action "${name}"`);
}

export function listPlugins(): string[] {
  return [...pluginRegistry.keys()];
}

// ── Security gate ─────────────────────────────────────────────────────────────
// Assertion/wait actions are excluded — they check the current URL, not navigate to it
const ASSERT_URL_ACTIONS = new Set(['assertUrl', 'assertTitle', 'waitForUrl']);

function applySecurity(action: ActionType, step: Step): { blocked: boolean; step: Step } {
  if (!ASSERT_URL_ACTIONS.has(action as string)) {
    for (const u of [step.expectedUrl, step.newTabUrl]) {
      if (u && !/^(https?:\/\/|\/)/i.test(u)) {
        Logger.warn(`Security: blocked unsafe URL "${u}" in action "${action}"`);
        return { blocked: true, step };
      }
    }
  }
  if (step.pattern && step.pattern.length > 500) {
    Logger.warn(`Security: pattern too long (${step.pattern.length} chars) in "${action}" — blocked (ReDoS)`);
    return { blocked: true, step };
  }
  if (step.label) step = { ...step, label: step.label.replace(/[\r\n]/g, ' ') };
  return { blocked: false, step };
}

// ── Action router — delegates to category modules ─────────────────────────────
export async function routeAction(page: Page, action: ActionType, step: Step): Promise<boolean> {
  try {
    const security = applySecurity(action, step);
    if (security.blocked) return false;
    step = security.step;

    const result =
      await handleNavigationAction(page, action as string, step) ??
      await handleMouseAction(page, action as string, step) ??
      await handleKeyboardAction(page, action as string, step) ??
      await handleFormAction(page, action as string, step) ??
      await handleAssertionAction(page, action as string, step) ??
      await handleWaitAction(page, action as string, step) ??
      await handleAdvancedAction(page, action as string, step) ??
      await handleExtendedAction(page, action as string, step) ??
      await handleExtendedAction2(page, action as string, step);

    if (result !== null) return result;

    // Plugin registry fallback
    const customHandler = pluginRegistry.get(action as string);
    if (customHandler) {
      Logger.debug(`Plugin action: ${action}`);
      return customHandler(page, step);
    }

    Logger.warn(`Unknown action type: ${action as string}`);
    return false;
  } catch (e) {
    Logger.error(`ActionRouter "${action}" failed on "${step.label}"`, String(e));
    return false;
  }
}
