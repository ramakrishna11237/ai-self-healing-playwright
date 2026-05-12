import { SecurityEnforcer } from '../security/SecurityEnforcer';

describe('SecurityEnforcer', () => {
  describe('scanLocator', () => {
    it('should allow safe locators', () => {
      const safeLocators = [
        'button',
        "[data-testid='submit']",
        'text=Login',
        "getByRole('button', { name: 'Submit' })",
        '#username',
        '.btn-primary',
      ];

      safeLocators.forEach((locator) => {
        const result = SecurityEnforcer.scanLocator(locator);
        expect(result.safe).toBe(true);
        expect(result.risks).toEqual([]);
      });
    });

    it('should block dangerous patterns', () => {
      const dangerousLocators = [
        "eval('alert(1)')",
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'button; setTimeout(() => { alert(1) }, 1000)',
        "Function('alert(1)')()",
        'button${alert(1)}',
      ];

      dangerousLocators.forEach((locator) => {
        const result = SecurityEnforcer.scanLocator(locator);
        expect(result.safe).toBe(false);
        expect(result.risks.length).toBeGreaterThan(0);
      });
    });

    it('should sanitize dangerous locators', () => {
      const dangerous = "eval('alert(1)') // malicious";
      const sanitized = SecurityEnforcer.sanitizeLocator(dangerous);

      expect(sanitized).not.toContain('eval');
      expect(sanitized).not.toContain('alert');
      expect(sanitized).not.toContain('//');

      const scan = SecurityEnforcer.scanLocator(sanitized);
      expect(scan.safe).toBe(true);
    });
  });

  describe('validateCssProperty', () => {
    it('should allow safe CSS properties', () => {
      const safeProperties = ['color', 'background-color', 'font-size', 'width'];
      safeProperties.forEach((prop) => {
        expect(SecurityEnforcer.validateCssProperty(prop)).toBe(true);
      });
    });

    it('should block dangerous CSS properties', () => {
      const dangerousProperties = ['expression', 'javascript', 'behavior', 'url'];
      dangerousProperties.forEach((prop) => {
        expect(SecurityEnforcer.validateCssProperty(prop)).toBe(false);
      });
    });
  });

  describe('validatePerformanceMetric', () => {
    it('should allow safe metrics', () => {
      const safeMetrics = ['pageLoad', 'TTFB', 'FCP', 'LCP'];
      safeMetrics.forEach((metric) => {
        expect(SecurityEnforcer.validatePerformanceMetric(metric)).toBe(true);
      });
    });

    it('should block unknown metrics', () => {
      const unknownMetrics = ['eval', 'Function', 'alert', 'window'];
      unknownMetrics.forEach((metric) => {
        expect(SecurityEnforcer.validatePerformanceMetric(metric)).toBe(false);
      });
    });
  });

  describe('scanAction', () => {
    it('should flag dangerous actions', () => {
      const dangerousActions = ['executeScript', 'executeAsyncScript'];
      dangerousActions.forEach((action) => {
        const result = SecurityEnforcer.scanAction(action);
        expect(result.safe).toBe(false);
      });
    });

    it('should allow safe actions', () => {
      const safeActions = ['click', 'fill', 'assertVisible', 'screenshot'];
      safeActions.forEach((action) => {
        const result = SecurityEnforcer.scanAction(action);
        expect(result.safe).toBe(true);
      });
    });
  });

  describe('validateUrl', () => {
    it('should allow http and https URLs', () => {
      const safeUrls = [
        'https://example.com',
        'http://localhost:3000',
        'https://api.example.com/path',
      ];
      safeUrls.forEach((url) => {
        expect(SecurityEnforcer.validateUrl(url)).toBe(true);
      });
    });

    it('should block dangerous URLs', () => {
      const dangerousUrls = [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'file:///etc/passwd',
        'about:blank',
      ];
      dangerousUrls.forEach((url) => {
        expect(SecurityEnforcer.validateUrl(url)).toBe(false);
      });
    });
  });
});
