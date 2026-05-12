const PAIRED_TAGS = new Set(['button', 'a', 'select', 'textarea', 'label']);
const VOID_TAGS = new Set(['input']);

export function filterDOM(html: string): string {
  const parts: string[] = [];
  let i = 0;
  const len = html.length;

  while (i < len) {
    if (html[i] !== '<') {
      i++;
      continue;
    }

    // Find end of opening tag
    const tagStart = i;
    let j = i + 1;

    // Skip closing tags
    if (html[j] === '/') {
      i++;
      continue;
    }

    // Read tag name
    while (j < len && html[j] !== ' ' && html[j] !== '>' && html[j] !== '/') j++;
    const tagName = html.slice(i + 1, j).toLowerCase();

    // Find end of opening tag bracket
    let tagEnd = j;
    while (tagEnd < len && html[tagEnd] !== '>') tagEnd++;
    if (tagEnd >= len) break;
    tagEnd++; // include ">"

    if (VOID_TAGS.has(tagName)) {
      parts.push(html.slice(tagStart, tagEnd));
      i = tagEnd;
      continue;
    }

    if (PAIRED_TAGS.has(tagName)) {
      // Find matching closing tag using a simple depth counter
      const closeTag = `</${tagName}`;
      let depth = 1;
      let k = tagEnd;

      while (k < len && depth > 0) {
        const nextOpen = html.indexOf(`<${tagName}`, k);
        const nextClose = html.toLowerCase().indexOf(closeTag, k);

        if (nextClose === -1) break;

        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          k = nextOpen + 1;
        } else {
          depth--;
          if (depth === 0) {
            const closeEnd = html.indexOf('>', nextClose) + 1;
            parts.push(html.slice(tagStart, closeEnd));
            i = closeEnd;
          } else {
            k = nextClose + 1;
          }
        }
      }

      if (depth > 0) {
        i = tagEnd;
        continue;
      } // unclosed tag — skip past opening tag
    }

    i++;
  }

  return parts.join('');
}
