/**
 * Escape a string for safe use inside a CSS attribute selector value.
 * e.g. [aria-label="..."] or [data-testid="..."]
 * Strips control characters and limits length to prevent CSS injection.
 */
export function escapeCSSValue(str: string): string {
  if (!str) return '';
  // Strip control chars, null bytes, and CSS-breaking characters
  // eslint-disable-next-line no-control-regex
  const safe = str.replace(/[\x00-\x1f\x7f<>]/g, '').slice(0, 200);
  return safe.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Escape a string for safe use as a Playwright text= locator value.
 * Strips control characters and limits length.
 */
export function escapeTextValue(str: string): string {
  if (!str) return '';
  return (
    str
      // eslint-disable-next-line no-control-regex
      .replace(/[\n\r\x00-\x1f\x7f]/g, ' ')
      .trim()
      .slice(0, 200)
  );
}

/**
 * Validate that a selector string is non-empty and usable.
 */
export function validateSelector(selector: string): boolean {
  return Boolean(selector && selector.trim().length > 0);
}

/**
 * Sanitize a raw selector: trim and validate only.
 * Do NOT escape — raw locators like #id, .class, [attr] must stay intact.
 */
export function sanitizeSelector(selector: string): string {
  if (!validateSelector(selector)) return '';
  return selector.trim();
}
