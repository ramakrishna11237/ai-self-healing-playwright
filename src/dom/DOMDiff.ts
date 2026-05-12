import * as diff from 'diff';
import { Logger } from '../utils/Logger';

export function getDOMDiff(oldDOM: string, newDOM: string): diff.Change[] {
  try {
    const result = diff.diffLines(oldDOM, newDOM);
    const changes = result.filter((p) => p.added || p.removed).length;
    Logger.debug(`DOM diff generated: ${changes} changes`);
    return result;
  } catch (e) {
    Logger.error('getDOMDiff failed', e);
    return [];
  }
}
