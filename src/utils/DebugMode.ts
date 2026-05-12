import { Page } from '@playwright/test';
import { Logger } from './Logger';

/**
 * DebugMode — visual step-by-step debugging for test development.
 *
 * When enabled (FW_DEBUG=true or explicitly), each step:
 *  - Highlights the target element with a colored border
 *  - Shows a tooltip with the step label and action
 *  - Pauses briefly so you can see what's happening
 *  - Logs a detailed trace of every action
 *
 * Usage:
 *   FW_DEBUG=true npm run test:headed
 *
 * Or in code:
 *   const debug = new DebugMode(page);
 *   await debug.highlight("getByRole('button', { name: 'Save' })", "Click Save");
 */
export class DebugMode {
  private enabled: boolean;
  private stepDelay: number;

  constructor(page: Page, enabled?: boolean) {
    this.page = page;
    this.enabled = enabled ?? process.env['FW_DEBUG'] === 'true';
    this.stepDelay = parseInt(process.env['FW_DEBUG_DELAY'] ?? '500', 10);
  }

  private page: Page;

  /**
   * Highlight an element before interacting with it.
   * Shows a colored border + label tooltip for stepDelay ms.
   */
  async highlight(locator: string, label: string, action = 'action'): Promise<void> {
    if (!this.enabled) return;
    try {
      // Only pass CSS/XPath locators to querySelector — skip getBy* strings
      const cssLocator = locator.startsWith('getBy') ? null : locator;
      await this.page.evaluate(
        ({ loc, lbl, act }) => {
          if (!loc) return;
          const el = document.querySelector(loc) as HTMLElement | null;
          if (!el) return;

          const prev = el.style.cssText;
          el.style.outline = '3px solid #ff6b35';
          el.style.outlineOffset = '2px';
          el.style.backgroundColor = 'rgba(255, 107, 53, 0.1)';

          const tip = document.createElement('div');
          tip.id = '__fw_debug_tip__';
          tip.style.cssText = [
            'position:fixed',
            'top:8px',
            'right:8px',
            'z-index:999999',
            'background:#1a1a2e',
            'color:#fff',
            'padding:8px 12px',
            'border-radius:6px',
            'font:13px monospace',
            'max-width:400px',
            'border-left:4px solid #ff6b35',
            'box-shadow:0 4px 12px rgba(0,0,0,0.4)',
          ].join(';');
          // Use textContent instead of innerHTML to prevent XSS
          tip.textContent = `${act}: ${lbl}`;
          document.body.appendChild(tip);

          setTimeout(() => {
            el.style.cssText = prev;
            tip.remove();
          }, 1500);
        },
        { loc: cssLocator, lbl: label, act: action }
      );
      await this.page.waitForTimeout(this.stepDelay);
    } catch {
      /* non-fatal — debug overlay is best-effort */
    }
  }

  /**
   * Show a step banner at the top of the page.
   * Useful for marking workflow boundaries in headed mode.
   */
  async banner(message: string, color = '#4361ee'): Promise<void> {
    if (!this.enabled) return;
    // CWE-95: color validated against hex/named pattern; set via style.background not cssText
    const SAFE_COLOR = /^(#[0-9a-fA-F]{3,6}|[a-zA-Z]{2,20})$/;
    const safeColor = SAFE_COLOR.test(color) ? color : '#4361ee';
    try {
      await this.page.evaluate(
        ({ msg, clr }: { msg: string; clr: string }) => {
          const existing = document.getElementById('__fw_banner__');
          if (existing) existing.remove();
          const banner = document.createElement('div');
          banner.id = '__fw_banner__';
          banner.style.position = 'fixed';
          banner.style.top = '0';
          banner.style.left = '0';
          banner.style.right = '0';
          banner.style.zIndex = '999998';
          banner.style.background = clr;
          banner.style.color = '#fff';
          banner.style.padding = '6px 16px';
          banner.style.font = 'bold 13px monospace';
          banner.style.textAlign = 'center';
          banner.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
          banner.textContent = msg;
          document.body.appendChild(banner);
          setTimeout(() => banner.remove(), 3000);
        },
        { msg: message, clr: safeColor }
      );
    } catch {
      /* non-fatal */
    }
  }

  /**
   * Pause execution — useful for inspecting state mid-test.
   * Only pauses when FW_DEBUG=true, no-op otherwise.
   */
  async pause(ms?: number): Promise<void> {
    if (!this.enabled) return;
    await this.page.waitForTimeout(ms ?? this.stepDelay * 2);
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
