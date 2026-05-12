export function sanitizeDOM(html: string): string {
  if (!html) return '';

  return (
    html
      // Strip script tags
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      // Strip inline event handlers
      .replace(/on\w+="[^"]*"/gi, '')
      // Strip hidden input values entirely
      .replace(/(<input[^>]+type=["']hidden["'][^>]*?)\svalue=["'][^"']*["']/gi, '$1')
      // Strip sensitive data-* attribute values
      .replace(
        /\bdata-(auth|token|key|secret|password|email|ssn|card|user|session)[^=]*=["'][^"']*["']/gi,
        'data-[REDACTED]=""'
      )
      // Strip tokens/secrets from URLs (href, src, action)
      .replace(
        /([?&](token|auth|key|secret|password|email|session_id|csrf)[^=]*=)[^&"'\s]*/gi,
        '$1[REDACTED]'
      )
      // Strip inline token/secret assignments
      .replace(/\b(token|apikey|api_key|auth_token|auth|secret|password)\s*=\s*\S+/gi, '$1=REMOVED')
      // Strip sensitive attribute values
      .replace(
        /value=["'][^"'{]*(?:token|apikey|api_key|auth_token|secret|password)[^"']*["']/gi,
        'value="REMOVED"'
      )
      // Strip Bearer tokens
      .replace(/\b(Authorization|X-API-Key|X-Auth-Token):\s*Bearer\s+\S+/gi, '$1: Bearer REMOVED')
      // Strip SSN patterns (123-45-6789)
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN-REDACTED]')
      // Strip credit card patterns (16 digits with optional dashes/spaces)
      .replace(/\b(?:\d{4}[\s-]?){3}\d{4}\b/g, '[CARD-REDACTED]')
      // Strip email addresses
      .replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, '[EMAIL-REDACTED]')
  );
}
