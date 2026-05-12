/**
 * LeaveManagementPage — Page Object for OrangeHRM Leave Module
 *
 * URL: https://opensource-demo.orangehrmlive.com
 * Credentials: Admin / admin123
 *
 * Covers:
 *   - Leave List (admin view)
 *   - Apply Leave
 *   - Leave Entitlements
 *   - Leave Types
 *   - Leave Reports
 *
 * RULES:
 *  1. All locators live here — NEVER in test files
 *  2. Use codegenLocator for semantic elements (getByRole, getByLabel, getByText)
 *  3. Use locator for CSS/XPath when app uses stable IDs or OrangeHRM-specific classes
 *  4. Use scope to restrict locators to containers
 *  5. Step labels must match visible element text — enables auto-healing
 */

import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { Step } from '../types';
import { Logger } from '../utils/Logger';

// ── All locators in one place ─────────────────────────────────────────────────
const Locators = {
  // ── Side navigation ──────────────────────────────────────────────────────────
  leaveMenu: "getByRole('link', { name: 'Leave' })",
  adminMenu: "getByRole('link', { name: 'Admin' })",
  pimMenu: "getByRole('link', { name: 'PIM' })",

  // ── Leave sub-menu items ──────────────────────────────────────────────────────
  applyLeaveLink: "getByRole('link', { name: 'Apply' })",
  myLeaveLink: "getByRole('link', { name: 'My Leave' })",
  leaveListLink: "getByRole('link', { name: 'Leave List' })",
  leaveEntitlementLink: "getByRole('link', { name: 'Entitlements' })",
  leaveTypesLink: ".oxd-sidepanel-body span:text-is('Leave Types')",
  leaveReportsLink: "getByRole('link', { name: 'Reports' })",

  // ── Apply Leave form ──────────────────────────────────────────────────────────
  leaveTypeDropdown: '.oxd-select-text--active, .oxd-select-text',
  fromDateInput: "(//div[contains(@class,'oxd-date-input')]//input)[1]",
  toDateInput: "(//div[contains(@class,'oxd-date-input')]//input)[2]",
  commentInput: "//div[label[text()='Comments']]//textarea",
  applyButton: "getByRole('button', { name: 'Apply' })",
  cancelButton: "getByRole('button', { name: 'Cancel' })",

  // ── Leave List filters ────────────────────────────────────────────────────────
  searchButton: "getByRole('button', { name: 'Search' })",
  resetButton: "getByRole('button', { name: 'Reset' })",
  leaveStatusDropdown:
    "//div[label[text()='Show Leave With Status']]//div[contains(@class,'oxd-select-text')]",
  dateFromFilter: "//div[label[text()='Date']]//input[1]",
  dateToFilter: "//div[label[text()='Date']]//input[2]",

  // ── Leave Entitlement form ────────────────────────────────────────────────────
  entitlementLeaveType:
    "//div[label[text()='Leave Type']]//div[contains(@class,'oxd-select-text')]",
  entitlementEmployee: "getByPlaceholder('Type for hints...')",
  entitlementDuration: "//div[label[text()='Entitlement']]//input",
  saveButton: "getByRole('button', { name: 'Save' })",
  confirmSaveButton: "getByRole('button', { name: 'Confirm' })",

  // ── Leave Types form ──────────────────────────────────────────────────────────
  leaveTypeNameInput: "//div[label[text()='Name']]//input",
  leaveTypeEntitlement: "//div[label[text()='Entitlement (Days)']]//input",
  addLeaveTypeButton: "getByRole('button', { name: ' Add' })",

  // ── Table / Results ───────────────────────────────────────────────────────────
  tableCard: '.oxd-table-card',
  tableBody: '.oxd-table-body',
  recordsFound: "//span[contains(text(),'Record Found') or contains(text(),'Records Found')]",
  noRecords: "//span[text()='No Records Found']",
  deleteButton: "getByRole('button', { name: 'Delete' })",
  confirmDeleteButton: "getByRole('button', { name: 'Yes, Delete' })",

  // ── Toasts ────────────────────────────────────────────────────────────────────
  successToast: '.oxd-toast--success',
  errorToast: '.oxd-toast--error',
  validationError: '.oxd-input-field-error-message',

  // ── Page identifiers ─────────────────────────────────────────────────────────
  leaveListHeading: "getByRole('heading', { name: 'Leave List' })",
  applyLeaveHeading: "getByRole('heading', { name: 'Apply Leave' })",
  leaveTypesHeading: "getByRole('heading', { name: 'Leave Types' })",
  entitlementHeading: "getByRole('heading', { name: 'Add Leave Entitlement' })",
} as const;

// ── Scopes — restrict locators to containers ──────────────────────────────────
const SCOPE = {
  form: '.oxd-form',
  table: '.oxd-table',
  dialog: '.oxd-dialog-container',
  filter: '.oxd-form',
} as const;

// ── Page class ────────────────────────────────────────────────────────────────
export class LeaveManagementPage extends BasePage {
  protected url = '/web/index.php/leave/viewLeaveList';
  protected pageIdentifier = Locators.searchButton;

  constructor(page: Page, testName = 'Leave Management') {
    super(page, testName);
  }

  // ── Navigation step groups ────────────────────────────────────────────────────

  navigateToLeaveListSteps(): Step[] {
    return [
      {
        label: 'Click Leave menu',
        action: 'click',
        codegenLocator: Locators.leaveMenu,
        timeout: 15000,
      },
      {
        label: 'Click Leave List',
        action: 'click',
        codegenLocator: Locators.leaveListLink,
        timeout: 10000,
      },
      {
        label: 'Verify Leave List loaded',
        action: 'assertVisible',
        codegenLocator: Locators.searchButton,
        timeout: 15000,
      },
    ];
  }

  navigateToApplyLeaveSteps(): Step[] {
    return [
      {
        label: 'Click Leave menu',
        action: 'click',
        codegenLocator: Locators.leaveMenu,
        timeout: 15000,
      },
      {
        label: 'Click Apply',
        action: 'click',
        codegenLocator: Locators.applyLeaveLink,
        timeout: 10000,
      },
      {
        label: 'Verify Apply Leave loaded',
        action: 'assertVisible',
        codegenLocator: Locators.applyButton,
        timeout: 15000,
      },
    ];
  }

  navigateToLeaveTypesSteps(): Step[] {
    return [
      {
        label: 'Navigate directly to Leave Types',
        action: 'navigate',
        expectedUrl: '/web/index.php/leave/leaveTypeList',
      },
      {
        label: 'Verify Leave Types loaded',
        action: 'assertVisible',
        codegenLocator: "getByRole('button', { name: ' Add' })",
        timeout: 15000,
      },
    ];
  }

  // ── Search step groups ────────────────────────────────────────────────────────

  searchLeaveListSteps(): Step[] {
    return [
      {
        label: 'Click Search on Leave List',
        action: 'click',
        codegenLocator: Locators.searchButton,
        timeout: 10000,
      },
      {
        label: 'Wait for leave results',
        action: 'waitForNetwork',
      },
    ];
  }

  resetLeaveFilterSteps(): Step[] {
    return [
      {
        label: 'Click Reset',
        action: 'click',
        codegenLocator: Locators.resetButton,
      },
      {
        label: 'Wait for reset',
        action: 'waitForNetwork',
      },
    ];
  }

  // ── Apply Leave step groups ───────────────────────────────────────────────────

  applyLeaveSteps(leaveType: string, fromDate: string, toDate: string, comment?: string): Step[] {
    return [
      {
        label: 'Click Leave Type dropdown',
        action: 'click',
        locator: Locators.leaveTypeDropdown,
        timeout: 10000,
      },
      {
        label: `Select ${leaveType}`,
        action: 'click',
        codegenLocator: `getByRole('option', { name: '${leaveType}' })`,
        timeout: 5000,
      },
      {
        label: 'Fill From Date',
        action: 'fill',
        locator: Locators.fromDateInput,
        value: fromDate,
        scope: SCOPE.form,
      },
      {
        label: 'Press Tab after From Date',
        action: 'keyPress',
        key: 'Tab',
      },
      {
        label: 'Fill To Date',
        action: 'fill',
        locator: Locators.toDateInput,
        value: toDate,
        scope: SCOPE.form,
      },
      {
        label: 'Press Tab after To Date',
        action: 'keyPress',
        key: 'Tab',
      },
      ...(comment
        ? [
            {
              label: 'Fill Comment',
              action: 'fill' as const,
              locator: Locators.commentInput,
              value: comment,
              scope: SCOPE.form,
            },
          ]
        : []),
      {
        label: 'Click Apply',
        action: 'click',
        codegenLocator: Locators.applyButton,
        scope: SCOPE.form,
      },
    ];
  }

  // ── Verification step groups ──────────────────────────────────────────────────

  verifyLeaveTableLoadedSteps(): Step[] {
    return [
      {
        label: 'Verify leave table visible',
        action: 'assertVisible',
        locator: Locators.tableBody,
        timeout: 10000,
      },
    ];
  }

  verifyNoRecordsSteps(): Step[] {
    return [
      {
        label: 'Verify No Records Found',
        action: 'assertVisible',
        locator: Locators.noRecords,
        timeout: 8000,
      },
    ];
  }

  verifyValidationErrorSteps(): Step[] {
    return [
      {
        label: 'Navigate directly to Apply Leave',
        action: 'navigate',
        expectedUrl: '/web/index.php/leave/applyLeave',
      },
      {
        label: 'Wait for Apply Leave page to fully load',
        action: 'waitForNetwork',
      },
      {
        label: 'Click Apply without data',
        action: 'click',
        codegenLocator: "getByRole('button', { name: 'Apply' })",
        timeout: 30000,
      },
      {
        label: 'Verify validation error visible',
        action: 'assertVisible',
        locator: Locators.validationError,
        timeout: 5000,
      },
    ];
  }

  // ── High-level helpers ────────────────────────────────────────────────────────

  async goToLeaveList(): Promise<void> {
    const result = await this.run(
      this.navigateToLeaveListSteps(),
      'Navigate to Leave List',
      'general',
      { workflowRetries: 1 }
    );
    if (result.failed > 0) throw new Error('Failed to navigate to Leave List');
    Logger.success('On Leave List page');
  }

  async goToApplyLeave(): Promise<void> {
    const result = await this.run(
      this.navigateToApplyLeaveSteps(),
      'Navigate to Apply Leave',
      'general',
      { workflowRetries: 1 }
    );
    if (result.failed > 0) throw new Error('Failed to navigate to Apply Leave');
    Logger.success('On Apply Leave page');
  }

  async getLeaveRecordCount(): Promise<number> {
    return this.count(Locators.tableCard);
  }
}
