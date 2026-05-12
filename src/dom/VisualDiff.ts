import * as fs from 'fs';
import * as path from 'path';
import * as diff from 'diff';
import { Logger } from '../utils/Logger';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate an HTML visual diff report.
 * Accepts pre-computed changes from getDOMDiff() to avoid running diff twice.
 *
 * @param changes  Pre-computed diff.Change[] from getDOMDiff()
 *                 OR old/new strings if called standalone
 */
export function generateVisualDiff(oldOrChanges: string | diff.Change[], newDOM?: string): void {
  try {
    let changes: diff.Change[];

    if (Array.isArray(oldOrChanges)) {
      // Called with pre-computed changes — zero extra diff cost
      changes = oldOrChanges;
    } else {
      // Called standalone with strings — compute diff once
      if (!oldOrChanges || !newDOM) {
        Logger.debug('generateVisualDiff: empty DOM, skipping');
        return;
      }
      changes = diff.diffLines(oldOrChanges, newDOM);
    }

    const hasChanges = changes.some((p) => p.added || p.removed);
    if (!hasChanges) {
      Logger.debug('generateVisualDiff: no changes detected');
      return;
    }

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family: monospace; font-size: 13px; }
  pre { margin: 0; padding: 4px 8px; white-space: pre-wrap; word-break: break-all; }
  .add { background: #d4edda; }
  .remove { background: #f8d7da; }
  .context { color: #666; }
</style></head><body>\n`;

    for (const p of changes) {
      const cls = p.added ? 'add' : p.removed ? 'remove' : 'context';
      const prefix = p.added ? '+ ' : p.removed ? '- ' : '  ';
      html += `<pre class="${cls}">${prefix}${escapeHtml(p.value)}</pre>\n`;
    }

    html += '</body></html>';

    const baseDir = path.resolve('test-results', 'diffs');
    const fileName = path.join(baseDir, 'diff-' + Date.now() + '.html');
    const resolvedPath = path.resolve(fileName);

    if (!resolvedPath.startsWith(baseDir)) {
      throw new Error('Path traversal attempt detected');
    }

    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, html, 'utf8');
    Logger.debug(`Visual diff saved: ${fileName}`);
  } catch (e) {
    Logger.error('generateVisualDiff failed', e);
  }
}
