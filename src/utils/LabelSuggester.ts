import { Step } from '../types';
import { extractElementName } from '../engine/LocatorEngine';

/**
 * LabelSuggester — auto-generates human-readable step labels from locators.
 *
 * Used in two ways:
 *
 * 1. Runtime auto-label: if step.label is missing or generic,
 *    the framework fills it automatically before execution.
 *
 * 2. CLI suggestion: scans test files and prints suggested labels
 *    for steps that have weak or missing labels.
 *
 * Examples:
 *   getByRole('button', { name: 'Save' })     → "Click Save button"
 *   getByRole('textbox', { name: 'Username' }) → "Fill Username field"
 *   getByRole('link', { name: 'Modules' })    → "Click Modules link"
 *   getByLabel('Email address')               → "Fill Email address field"
 *   getByText('Record saved.')                → "Verify Record saved. visible"
 *   #submit-btn                               → "Click submit"
 *   .ocr-card-info                            → "Verify ocr-card-info visible"
 *   [data-testid="submit-btn"]                → "Click submit-btn"
 */
export class LabelSuggester {
  /**
   * Generate a suggested label for a step based on its locator and action.
   * Returns null if the existing label is already good.
   */
  static suggest(step: Step): string | null {
    const existing = step.label?.trim();

    // Already has a good label — don't override
    if (existing && existing.length > 3 && !this.isGenericLabel(existing)) {
      return null;
    }

    const action = step.action ?? 'click';
    const locator = step.codegenLocator ?? step.locator ?? '';

    return this.generateLabel(action, locator) ?? existing ?? `Step [${action}]`;
  }

  /**
   * Auto-fill label on a step if missing or generic.
   * Mutates the step in place — call before execution.
   */
  static autoFill(step: Step): Step {
    const suggestion = this.suggest(step);
    if (suggestion && suggestion !== step.label) {
      return { ...step, label: suggestion };
    }
    return step;
  }

  /**
   * Generate a label from action + locator.
   */
  static generateLabel(action: string, locator: string): string | null {
    if (!locator) return null;

    const name = extractElementName(locator);
    const role = this.extractRole(locator);
    const cssName = this.extractCSSName(locator);

    const elementName = name ?? cssName;
    if (!elementName) return null;

    const verb = this.actionVerb(action, role);
    const suffix = this.roleSuffix(role, action);

    return `${verb} ${elementName}${suffix}`;
  }

  /**
   * Suggest labels for all steps in an array.
   * Returns array of { stepIndex, currentLabel, suggestedLabel } for weak labels.
   */
  static auditSteps(steps: Step[]): Array<{
    index: number;
    current: string;
    suggested: string;
    locator: string;
  }> {
    const results = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const suggestion = this.suggest(step);
      if (suggestion && suggestion !== step.label) {
        results.push({
          index: i,
          current: step.label ?? '(no label)',
          suggested: suggestion,
          locator: step.codegenLocator ?? step.locator ?? '',
        });
      }
    }
    return results;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private static isGenericLabel(label: string): boolean {
    const generic = [
      'step',
      'click',
      'fill',
      'verify',
      'assert',
      'action',
      'button',
      'link',
      'input',
      'field',
      'element',
      'step 1',
      'step 2',
      'step 3',
      'do the thing',
      'test step',
    ];
    return generic.some((g) => label.toLowerCase() === g) || /^step\s*\d+$/i.test(label);
  }

  private static extractRole(locator: string): string | null {
    const m = locator.match(/^getByRole\(\s*['"]([^'"]+)['"]/);
    return m ? m[1] : null;
  }

  private static extractCSSName(locator: string): string | null {
    if (!locator) return null;

    // data-testid="value"
    let m = locator.match(/data-testid[=\s]*["']([^"']+)["']/);
    if (m) return m[1];

    // aria-label="value"
    m = locator.match(/aria-label[=\s]*["']([^"']+)["']/);
    if (m) return m[1];

    // #id → extract readable part
    m = locator.match(/^#([\w-]+)/);
    if (m) return this.humanizeId(m[1]);

    // .class → extract readable part
    m = locator.match(/^\.([\w-]+)/);
    if (m) return this.humanizeId(m[1]);

    // [name="value"]
    m = locator.match(/\[name[=\s]*["']([^"']+)["']/);
    if (m) return m[1];

    // [id="value"]
    m = locator.match(/\[id[=\s]*["']([^"']+)["']/);
    if (m) return this.humanizeId(m[1]);

    // text=value
    m = locator.match(/^text=(.+)/);
    if (m) return m[1].trim();

    return null;
  }

  private static humanizeId(id: string): string {
    // submit-btn → submit
    return id
      .replace(/^(record_|handleMain_|handleOfficer_|create_modal_|s2id_)/, '')
      .replace(/(_df|_tf|_btn|_button|_field|_input)$/, '')
      .replace(/[_-]/g, ' ')
      .trim();
  }

  private static actionVerb(action: string, _role: string | null): string {
    switch (action) {
      case 'click':
      case 'doubleClick':
      case 'rightClick':
        return 'Click';
      case 'fill':
      case 'typeSlowly':
      case 'clearInput':
        return 'Fill';
      case 'check':
        return 'Check';
      case 'uncheck':
        return 'Uncheck';
      case 'hover':
        return 'Hover over';
      case 'assertVisible':
      case 'validation':
        return 'Verify';
      case 'assertHidden':
        return 'Verify hidden';
      case 'assertText':
        return 'Verify text of';
      case 'assertValue':
        return 'Verify value of';
      case 'assertChecked':
        return 'Verify checked';
      case 'dropdown':
      case 'multiSelect':
        return 'Select from';
      case 'navigate':
        return 'Navigate to';
      case 'upload':
        return 'Upload to';
      case 'fileDownload':
        return 'Download from';
      case 'submit':
        return 'Submit';
      case 'scroll':
      case 'scrollTo':
        return 'Scroll to';
      case 'screenshot':
        return 'Screenshot';
      case 'wait':
      case 'waitForText':
      case 'waitForNetwork':
        return 'Wait for';
      default:
        return 'Interact with';
    }
  }

  private static roleSuffix(role: string | null, action: string): string {
    if (!role) return '';
    const assertActions = [
      'assertVisible',
      'assertHidden',
      'assertText',
      'assertValue',
      'validation',
    ];
    if (assertActions.includes(action)) return '';

    switch (role) {
      case 'button':
        return ' button';
      case 'link':
        return ' link';
      case 'textbox':
        return ' field';
      case 'checkbox':
        return ' checkbox';
      case 'radio':
        return ' radio';
      case 'combobox':
        return ' dropdown';
      case 'option':
        return ' option';
      case 'tab':
        return ' tab';
      case 'menuitem':
        return ' menu item';
      case 'heading':
        return '';
      case 'row':
        return ' row';
      default:
        return '';
    }
  }
}
