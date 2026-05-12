/**
 * ElementExistenceHealer — Layer 7
 *
 * When ALL previous layers fail because an element genuinely doesn't exist,
 * this layer scans the page for semantically similar elements and tries them.
 *
 * Examples:
 *   - "Cancel" button not found → tries "Reset", "Back", "Close", "Dismiss"
 *   - "Submit" button not found → tries "Save", "Confirm", "Apply", "OK"
 *   - "Username" field not found → tries "Email", "Login", "User"
 *   - "Search" button not found → tries "Find", "Filter", "Go", "Look up"
 *
 * Synonyms are loaded from synonyms.json — edit that file to add
 * your app-specific synonyms without touching this code.
 */

import { Page } from '@playwright/test';
import { Logger } from '../utils/Logger';
import * as fs from 'fs';
import * as path from 'path';

export interface HealResult {
  healed: boolean;
  locator?: string;
  originalLabel: string;
  foundLabel: string;
  confidence: number;
  reason: string;
}

// ── Default synonym groups (fallback if synonyms.json not found) ──────────────

const DEFAULT_SYNONYM_GROUPS: string[][] = [
  ['cancel', 'reset', 'back', 'close', 'dismiss', 'discard', 'abort', 'exit', 'no'],
  ['submit', 'save', 'confirm', 'apply', 'ok', 'done', 'finish', 'complete', 'yes', 'proceed'],
  ['search', 'find', 'filter', 'go', 'look up', 'query', 'lookup'],
  ['username', 'email', 'login', 'user', 'user name', 'user id', 'userid', 'account'],
  ['password', 'pass', 'pwd', 'secret', 'passphrase'],
  ['add', 'create', 'new', 'insert', 'plus'],
  ['edit', 'update', 'modify', 'change', 'pencil'],
  ['delete', 'remove', 'trash', 'bin', 'clear'],
  ['next', 'continue', 'forward', 'proceed', 'advance'],
  ['previous', 'prev', 'back', 'prior'],
  ['login', 'sign in', 'log in', 'signin', 'enter'],
  ['logout', 'sign out', 'log out', 'signout', 'exit'],
  ['home', 'dashboard', 'main', 'overview', 'start'],
  ['profile', 'account', 'settings', 'preferences', 'my info'],
  ['upload', 'attach', 'browse', 'choose file', 'select file'],
  ['download', 'export', 'save as', 'get'],
];

// ── Load synonyms from synonyms.json (user-configurable) ─────────────────────

function loadSynonymGroups(): string[][] {
  const configFile = path.resolve(process.cwd(), 'synonyms.json');
  try {
    if (fs.existsSync(configFile)) {
      const raw = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      const groups: string[][] = [];
      for (const [key, values] of Object.entries(raw)) {
        if (key.startsWith('_')) continue;
        if (key === '_custom_groups') {
          for (const [k, v] of Object.entries(values as Record<string, unknown>)) {
            if (k.startsWith('_')) continue;
            if (Array.isArray(v)) groups.push([k, ...(v as string[])]);
          }
          continue;
        }
        if (Array.isArray(values)) groups.push([key, ...(values as string[])]);
      }
      Logger.debug(`Layer 7: loaded ${groups.length} synonym groups from synonyms.json`);
      return groups;
    }
  } catch (e) {
    Logger.warn(`Layer 7: failed to load synonyms.json — using defaults: ${String(e).slice(0, 80)}`);
  }
  return DEFAULT_SYNONYM_GROUPS;
}

// Load lazily on first use
let _synonymGroups: string[][] | null = null;

function getSynonymGroups(): string[][] {
  if (_synonymGroups) return _synonymGroups;
  _synonymGroups = loadSynonymGroups();
  return _synonymGroups;
}

// ── Build reverse lookup: word → synonym group ────────────────────────────────
function buildSynonymMap(groups: string[][]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const group of groups) {
    for (const word of group) {
      map.set(word.toLowerCase(), group);
    }
  }
  return map;
}

export class ElementExistenceHealer {

  /**
   * Try to find a semantic alternative for a missing element.
   * Returns a healed locator string if found, null otherwise.
   */
  static async heal(page: Page, label: string, action: string): Promise<HealResult | null> {
    if (!label) return null;

    const normalizedLabel = label.toLowerCase().trim();
    const synonyms = this.getSynonyms(normalizedLabel);

    if (synonyms.length === 0) {
      Logger.debug(`Layer 7: no synonyms found for "${label}"`);
      return null;
    }

    Logger.debug(`Layer 7: trying ${synonyms.length} semantic alternatives for "${label}": ${synonyms.join(', ')}`);

    const roles = this.getRolesForAction(action);

    for (const synonym of synonyms) {
      if (synonym === normalizedLabel) continue;

      for (const role of roles) {
        const locator = `getByRole('${role}', { name: '${this.capitalize(synonym)}' })`;
        try {
          const el = page.getByRole(role as never, { name: new RegExp(synonym, 'i') });
          const count = await el.count();
          if (count > 0) {
            const confidence = this.calcConfidence(normalizedLabel, synonym);
            Logger.success(
              `Layer 7: "${label}" not found — healed via semantic match: ` +
              `found "${this.capitalize(synonym)}" ${role} instead (confidence: ${confidence})`
            );
            return {
              healed: true,
              locator,
              originalLabel: label,
              foundLabel: this.capitalize(synonym),
              confidence,
              reason: `"${label}" not found on page — used semantic synonym "${this.capitalize(synonym)}" (${role})`,
            };
          }
        } catch {
          // element not found with this synonym/role combo — try next
        }
      }
    }

    // Text-based search as last resort
    for (const synonym of synonyms) {
      if (synonym === normalizedLabel) continue;
      try {
        const el = page.getByText(new RegExp(`^${synonym}$`, 'i'));
        const count = await el.count();
        if (count > 0) {
          const confidence = this.calcConfidence(normalizedLabel, synonym) - 10;
          Logger.success(
            `Layer 7: "${label}" not found — healed via text match: ` +
            `found "${this.capitalize(synonym)}" text instead (confidence: ${confidence})`
          );
          return {
            healed: true,
            locator: `getByText('${this.capitalize(synonym)}')`,
            originalLabel: label,
            foundLabel: this.capitalize(synonym),
            confidence,
            reason: `"${label}" not found — used text match "${this.capitalize(synonym)}"`,
          };
        }
      } catch {
        // not found
      }
    }

    Logger.debug(`Layer 7: no semantic alternative found for "${label}"`);
    return null;
  }

  private static getSynonyms(label: string): string[] {
    const synonymMap = buildSynonymMap(getSynonymGroups());
    const direct = synonymMap.get(label);
    if (direct) return direct;

    for (const [word, group] of synonymMap.entries()) {
      if (label.includes(word) || word.includes(label)) {
        return group;
      }
    }

    return [];
  }

  private static getRolesForAction(action: string): string[] {
    switch (action) {
      case 'click':
      case 'submit':
        return ['button', 'link', 'menuitem'];
      case 'fill':
      case 'type':
        return ['textbox', 'searchbox', 'combobox'];
      case 'check':
      case 'uncheck':
        return ['checkbox', 'radio'];
      case 'select':
        return ['combobox', 'listbox', 'option'];
      default:
        return ['button', 'link', 'textbox', 'menuitem'];
    }
  }

  private static calcConfidence(original: string, synonym: string): number {
    const synonymMap = buildSynonymMap(getSynonymGroups());
    const group = synonymMap.get(original) ?? [];
    const origIdx = group.indexOf(original);
    const synIdx = group.indexOf(synonym);
    const distance = Math.abs(origIdx - synIdx);

    if (distance === 1) return 75;
    if (distance === 2) return 65;
    return 55;
  }

  private static capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
