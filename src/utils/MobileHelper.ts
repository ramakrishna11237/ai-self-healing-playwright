import { Page, BrowserContext, devices } from '@playwright/test';
import { Logger } from './Logger';

/**
 * All Playwright built-in device names available for emulation.
 * Use with MobileHelper.emulateDevice() or in playwright.config.ts projects.
 */
export const MOBILE_DEVICES = {
  // Android
  'Pixel 5': devices['Pixel 5'],
  'Pixel 7': devices['Pixel 7'],
  'Galaxy S9+': devices['Galaxy S9+'],
  'Galaxy Tab S4': devices['Galaxy Tab S4'],
  // iPhone
  'iPhone 12': devices['iPhone 12'],
  'iPhone 13': devices['iPhone 13'],
  'iPhone 14': devices['iPhone 14'],
  'iPhone 14 Pro Max': devices['iPhone 14 Pro Max'],
  'iPhone SE': devices['iPhone SE'],
  // iPad
  'iPad Pro 11': devices['iPad Pro 11'],
  'iPad Mini': devices['iPad Mini'],
  // Landscape variants
  'Pixel 5 landscape': devices['Pixel 5 landscape'],
  'iPhone 14 Pro Max landscape': devices['iPhone 14 Pro Max landscape'],
} as const;

export type MobileDeviceName = keyof typeof MOBILE_DEVICES;

export class MobileHelper {
  constructor(private page: Page) {}

  /**
   * Emulate a mobile device — sets viewport, userAgent, touch, deviceScaleFactor.
   * Call before page.goto() for accurate emulation.
   *
   * @example
   *   const mobile = new MobileHelper(page);
   *   await mobile.emulateDevice("iPhone 14");
   *   await page.goto(url);
   */
  async emulateDevice(deviceName: MobileDeviceName): Promise<void> {
    const device = MOBILE_DEVICES[deviceName];
    await this.page.setViewportSize(device.viewport);
    await this.page.setExtraHTTPHeaders({
      'User-Agent': device.userAgent,
    });
    Logger.info(
      `Mobile: emulating "${deviceName}" (${device.viewport.width}x${device.viewport.height})`
    );
  }

  /**
   * Set a custom viewport size — useful for tablet or custom breakpoint testing.
   */
  async setViewport(width: number, height: number): Promise<void> {
    await this.page.setViewportSize({ width, height });
    Logger.info(`Mobile: viewport set to ${width}x${height}`);
  }

  /**
   * Rotate to landscape orientation.
   */
  async rotateToLandscape(): Promise<void> {
    const vp = this.page.viewportSize();
    if (!vp) return;
    if (vp.width > vp.height) {
      Logger.debug('Mobile: already in landscape');
      return;
    }
    await this.page.setViewportSize({ width: vp.height, height: vp.width });
    Logger.info(`Mobile: rotated to landscape (${vp.height}x${vp.width})`);
  }

  /**
   * Rotate to portrait orientation.
   */
  async rotateToPortrait(): Promise<void> {
    const vp = this.page.viewportSize();
    if (!vp) return;
    if (vp.height > vp.width) {
      Logger.debug('Mobile: already in portrait');
      return;
    }
    await this.page.setViewportSize({ width: vp.height, height: vp.width });
    Logger.info(`Mobile: rotated to portrait (${vp.height}x${vp.width})`);
  }

  /**
   * Tap on an element — mobile touch event.
   */
  async tap(locator: string): Promise<void> {
    await this.page.locator(locator).first().tap();
    Logger.info(`Mobile: tapped "${locator}"`);
  }

  /**
   * Swipe gesture — simulates touch drag from one point to another.
   * @param direction  up | down | left | right
   * @param distance   pixels to swipe (default 300)
   */
  async swipe(direction: 'up' | 'down' | 'left' | 'right', distance = 300): Promise<void> {
    const vp = this.page.viewportSize() ?? { width: 390, height: 844 };
    const cx = vp.width / 2;
    const cy = vp.height / 2;

    const vectors: Record<string, [number, number]> = {
      up: [cx, cy + distance / 2, cx, cy - distance / 2],
      down: [cx, cy - distance / 2, cx, cy + distance / 2],
      left: [cx + distance / 2, cy, cx - distance / 2, cy],
      right: [cx - distance / 2, cy, cx + distance / 2, cy],
    } as unknown as Record<string, [number, number]>;

    const [x1, y1, x2, y2] = vectors[direction] as unknown as number[];

    await this.page.touchscreen.tap(x1, y1);
    await this.page.mouse.move(x1, y1);
    await this.page.mouse.down();
    await this.page.mouse.move(x2, y2, { steps: 10 });
    await this.page.mouse.up();
    Logger.info(`Mobile: swiped ${direction} ${distance}px`);
  }

  /**
   * Pinch zoom in — simulates two-finger spread gesture.
   */
  async pinchZoomIn(): Promise<void> {
    const vp = this.page.viewportSize() ?? { width: 390, height: 844 };
    const cx = vp.width / 2;
    const cy = vp.height / 2;
    await this.page.evaluate(
      ({ cx, cy }) => {
        const touch1 = new Touch({
          identifier: 1,
          target: document.body,
          clientX: cx - 50,
          clientY: cy,
        });
        const touch2 = new Touch({
          identifier: 2,
          target: document.body,
          clientX: cx + 50,
          clientY: cy,
        });
        document.body.dispatchEvent(
          new TouchEvent('touchstart', { touches: [touch1, touch2], bubbles: true })
        );
        const t1end = new Touch({
          identifier: 1,
          target: document.body,
          clientX: cx - 100,
          clientY: cy,
        });
        const t2end = new Touch({
          identifier: 2,
          target: document.body,
          clientX: cx + 100,
          clientY: cy,
        });
        document.body.dispatchEvent(
          new TouchEvent('touchmove', { touches: [t1end, t2end], bubbles: true })
        );
        document.body.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true }));
      },
      { cx, cy }
    );
    Logger.info('Mobile: pinch zoom in');
  }

  /**
   * Scroll within a specific element — useful for mobile lists.
   */
  async scrollElement(locator: string, direction: 'up' | 'down', distance = 300): Promise<void> {
    const el = this.page.locator(locator).first();
    await el.evaluate(
      (node, { dir, dist }) => {
        node.scrollBy(0, dir === 'down' ? dist : -dist);
      },
      { dir: direction, dist: distance }
    );
    Logger.info(`Mobile: scrolled element "${locator}" ${direction} ${distance}px`);
  }

  /**
   * Mock device geolocation.
   */
  async setGeolocation(
    context: BrowserContext,
    latitude: number,
    longitude: number,
    accuracy = 10
  ): Promise<void> {
    await context.setGeolocation({ latitude, longitude, accuracy });
    await context.grantPermissions(['geolocation']);
    Logger.info(`Mobile: geolocation set to ${latitude}, ${longitude}`);
  }

  /**
   * Check if current viewport is mobile-sized (width < 768px).
   */
  isMobileViewport(): boolean {
    const vp = this.page.viewportSize();
    return !!vp && vp.width < 768;
  }

  /**
   * Get current viewport info.
   */
  getViewport() {
    return this.page.viewportSize();
  }
}
