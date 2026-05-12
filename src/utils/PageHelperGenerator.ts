import { Page } from '@playwright/test';

// Maps role names to native element selectors that don't always have explicit role attributes
const ROLE_SELECTORS: Record<string, string> = {
  button:
    "button, [role='button'], input[type='button'], input[type='submit'], input[type='reset']",
  link: "a[href], [role='link']",
  textbox:
    "input:not([type='checkbox']):not([type='radio']):not([type='file']):not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']), textarea, [role='textbox']",
  checkbox: "input[type='checkbox'], [role='checkbox']",
  combobox: "select, [role='combobox']",
  option: "option, [role='option']",
};

export class PageHelperGenerator {
  private discoveredElements: Map<string, string[]> = new Map();

  constructor(private page: Page) {}

  async discoverAll(): Promise<Map<string, string[]>> {
    for (const role of Object.keys(ROLE_SELECTORS)) {
      await this.discoverByRole(role);
    }
    return this.discoveredElements;
  }

  async discoverByRole(role: string): Promise<string[]> {
    try {
      const selector = ROLE_SELECTORS[role] ?? `[role="${role}"]`;
      const locator = this.page.locator(selector);
      const count = await locator.count();
      const names: string[] = [];

      for (let i = 0; i < Math.min(count, 50); i++) {
        const el = locator.nth(i);
        const name =
          (await el.getAttribute('aria-label')) ||
          (await el.getAttribute('placeholder')) ||
          (await el.getAttribute('name')) ||
          (await el.getAttribute('id')) ||
          (await el.textContent())?.trim() ||
          `${role}_${i}`;

        if (name && !names.includes(name)) names.push(name.trim());
      }

      this.discoveredElements.set(role, names);
      return names;
    } catch {
      return [];
    }
  }

  generateMethods(): string {
    let code = '// Auto-generated PageHelper extension methods\n\n';

    for (const [role, names] of this.discoveredElements.entries()) {
      for (const name of names) {
        // Sanitize name before embedding in generated code
        const safeName = name.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 80);
        if (!safeName) continue;
        const safe = this.toMethodName(`${role}_${safeName}`);
        const escapedName = safeName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        if (role === 'button' || role === 'link') {
          code += `async ${safe}(): Promise<boolean> {\n  return this.performAction("click", "${role}", "${escapedName}");\n}\n\n`;
        } else if (role === 'textbox') {
          code += `async ${safe}(value: string): Promise<boolean> {\n  return this.performAction("fill", "textbox", "${escapedName}", value);\n}\n\n`;
        } else if (role === 'combobox') {
          code += `async ${safe}(option: string): Promise<boolean> {\n  return this.performAction("select", "combobox", "${escapedName}", option);\n}\n\n`;
        }
      }
    }

    return code;
  }

  getSummary(): Record<string, string[]> {
    return Object.fromEntries(this.discoveredElements.entries());
  }

  private toMethodName(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())
      .replace(/^[^a-zA-Z_]/, '_');
  }
}
