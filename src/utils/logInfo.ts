/* eslint-disable no-console */
import { inspect } from 'util';

// Force colors on — Playwright workers don't inherit isTTY from parent terminal
const USE_COLORS =
  process.env['NO_COLOR'] === undefined &&
  process.env['TERM'] !== 'dumb' &&
  process.env['CI'] !== 'true';

export function logInfo(...args: unknown[]): void {
  const obj = args.length === 1 ? args[0] : [...args];
  if (typeof obj === 'string') {
    console.log(`${getUTCDate()} - `, obj);
  } else {
    console.log(`${getUTCDate()} - `, inspect(obj, { colors: USE_COLORS, depth: 4 }));
  }
}

export function logError(...args: unknown[]): void {
  const obj = args.length === 1 ? args[0] : [...args];
  if (typeof obj === 'string') {
    console.error(`${getUTCDate()} - `, obj);
  } else {
    console.error(`${getUTCDate()} - `, inspect(obj, { colors: USE_COLORS, depth: 4 }));
  }
}

export function logData<T>(data: T): T {
  const text = inspect(data, { colors: true, depth: 10 });
  for (const line of text.split('\n')) {
    console.log(line);
  }
  return data;
}

function getUTCDate(): string {
  return new Date().toISOString();
}
