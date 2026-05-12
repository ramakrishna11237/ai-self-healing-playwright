/**
 * NotificationService — Slack + Jira Integration
 *
 * Automatically:
 *   - Posts test results to Slack after every run
 *   - Creates Jira tickets for failures
 *   - Updates existing Jira tickets when tests pass
 *
 * Setup:
 *   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
 *   JIRA_BASE_URL=https://yourcompany.atlassian.net
 *   JIRA_EMAIL=you@company.com
 *   JIRA_API_TOKEN=your-token
 *   JIRA_PROJECT_KEY=QA
 */

import * as https from 'https';
import * as http from 'http';
import { Logger } from './Logger';

export interface TestSummary {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  passRate: number;
  duration: string;
  failedTests: { title: string; error: string; project: string }[];
  runUrl?: string;
}

export class NotificationService {

  // ── Slack ─────────────────────────────────────────────────────────────────

  static async notifySlack(summary: TestSummary): Promise<void> {
    const webhookUrl = process.env['SLACK_WEBHOOK_URL'];
    if (!webhookUrl) {
      Logger.debug('NotificationService: SLACK_WEBHOOK_URL not set — skipping Slack notification');
      return;
    }

    const emoji = summary.failed === 0 ? '✅' : '❌';
    const color = summary.failed === 0 ? '#48bb78' : '#fc8181';
    const status = summary.failed === 0 ? 'PASSED' : 'FAILED';

    const failedList = summary.failedTests.slice(0, 5)
      .map(t => `• *${t.title}*\n  ${t.error?.slice(0, 100) ?? 'Unknown error'}`)
      .join('\n');

    const payload = {
      attachments: [{
        color,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `${emoji} AI Automation Framework — ${status}`,
            },
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Pass Rate*\n${summary.passRate}%` },
              { type: 'mrkdwn', text: `*Tests*\n${summary.passed}/${summary.total} passed` },
              { type: 'mrkdwn', text: `*Failed*\n${summary.failed}` },
              { type: 'mrkdwn', text: `*Duration*\n${summary.duration}s` },
            ],
          },
          ...(summary.failedTests.length > 0 ? [{
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Failed Tests:*\n${failedList}`,
            },
          }] : []),
          ...(summary.runUrl ? [{
            type: 'actions',
            elements: [{
              type: 'button',
              text: { type: 'plain_text', text: '📊 View Dashboard' },
              url: summary.runUrl,
            }],
          }] : []),
        ],
      }],
    };

    try {
      await this.post(webhookUrl, payload);
      Logger.success('NotificationService: Slack notification sent');
    } catch (e) {
      Logger.warn(`NotificationService: Slack notification failed — ${String(e).slice(0, 80)}`);
    }
  }

  // ── Jira ──────────────────────────────────────────────────────────────────

  static async createJiraTickets(summary: TestSummary): Promise<void> {
    const baseUrl = process.env['JIRA_BASE_URL'];
    const email = process.env['JIRA_EMAIL'];
    const token = process.env['JIRA_API_TOKEN'];
    const project = process.env['JIRA_PROJECT_KEY'] ?? 'QA';

    if (!baseUrl || !email || !token) {
      Logger.debug('NotificationService: Jira credentials not set — skipping Jira integration');
      return;
    }

    for (const test of summary.failedTests.slice(0, 5)) {
      try {
        const issue = {
          fields: {
            project: { key: project },
            summary: `[Auto] Test Failed: ${test.title.slice(0, 100)}`,
            description: {
              type: 'doc',
              version: 1,
              content: [{
                type: 'paragraph',
                content: [{
                  type: 'text',
                  text: `Automated test failure detected.\n\nTest: ${test.title}\nProject: ${test.project}\nError: ${test.error ?? 'Unknown'}\n\nRun: ${new Date().toISOString()}`,
                }],
              }],
            },
            issuetype: { name: 'Bug' },
            priority: { name: summary.passRate < 80 ? 'High' : 'Medium' },
            labels: ['automated-test', 'test-failure'],
          },
        };

        const auth = Buffer.from(`${email}:${token}`).toString('base64');
        await this.post(
          `${baseUrl}/rest/api/3/issue`,
          issue,
          { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
        );
        Logger.success(`NotificationService: Jira ticket created for "${test.title.slice(0, 50)}"`);
      } catch (e) {
        Logger.warn(`NotificationService: Jira ticket creation failed — ${String(e).slice(0, 80)}`);
      }
    }
  }

  // ── Notify all channels ───────────────────────────────────────────────────

  static async notifyAll(summary: TestSummary): Promise<void> {
    await Promise.allSettled([
      this.notifySlack(summary),
      summary.failed > 0 ? this.createJiraTickets(summary) : Promise.resolve(),
    ]);
  }

  // ── HTTP POST helper ──────────────────────────────────────────────────────

  private static post(
    url: string,
    body: unknown,
    headers: Record<string, string> = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let parsed: URL;
      try { parsed = new URL(url); } catch { return reject(new Error(`Invalid URL: ${url}`)); }

      const lib = parsed.protocol === 'https:' ? https : http;
      const data = JSON.stringify(body);

      const req = lib.request({
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...headers,
        },
        timeout: 10000,
      }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
        } else {
          resolve();
        }
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.write(data);
      req.end();
    });
  }
}
