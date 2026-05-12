/**
 * EmployeePage — Page Object for OrangeHRM Employee Management
 *
 * RULES for writing page objects:
 *  1. All locators live here — NEVER in test files
 *  2. Use codegenLocator for semantic elements (getByRole, getByLabel)
 *  3. Use locator for CSS IDs when app uses stable IDs
 *  4. Use scope to restrict locators to containers (prevents wrong element matches)
 *  5. Step labels must match visible element text — enables auto-healing
 *  6. Group related steps into methods — tests call methods, not raw steps
 */

import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { Step } from '../types';
import { Logger } from '../utils/Logger';
import { TestDataManager } from '../utils/TestDataManager';

// ── Step 1: Define all locators in one place ──────────────────────────────────
// Use const object — TypeScript enforces no typos, IDE gives autocomplete
const Locators = {
  // ── Navigation ──────────────────────────────────────────────────────────────
  // codegenLocator: use getByRole/getByText — semantic, survives minor UI changes
  pimMenu: "getByRole('link', { name: 'PIM' })",
  employeeListMenu: "getByRole('link', { name: 'Employee List' })",
  addEmployeeMenu: "getByRole('link', { name: 'Add Employee' })",

  // ── Add Employee Form ────────────────────────────────────────────────────────
  // locator: use CSS ID when app has stable IDs (legacy apps often do)
  firstNameField: "input[name='firstName']",
  middleNameField: "input[name='middleName']",
  lastNameField: "input[name='lastName']",
  employeeIdField: "input[name='employeeId']",
  saveButton: "getByRole('button', { name: 'Save' })",
  cancelButton: "getByRole('button', { name: 'Cancel' })",

  // ── Search / Filter ──────────────────────────────────────────────────────────
  searchNameField: "getByPlaceholder('Type for hints...')",
  searchButton: "getByRole('button', { name: 'Search' })",
  resetButton: "getByRole('button', { name: 'Reset' })",

  // ── Employee List Table ──────────────────────────────────────────────────────
  // scope: restrict to table so we don't match header buttons
  employeeTable: '.oxd-table',
  tableRows: '.oxd-table-body .oxd-table-row',
  deleteButton: "getByRole('button', { name: 'Delete' })",
  // OrangeHRM edit is a pencil icon <a> tag — not a button
  editButton: '.oxd-icon-button.oxd-table-cell-action-space',

  // ── Confirmation Dialog ──────────────────────────────────────────────────────
  confirmDeleteButton: "getByRole('button', { name: 'Yes, Delete' })",
  dialogTitle: '.oxd-dialog-title',

  // ── Success/Error Messages ───────────────────────────────────────────────────
  successToast: '.oxd-toast--success',
  errorToast: '.oxd-toast--error',
  validationError: '.oxd-input-field-error-message',

  // ── Personal Details (Edit page) ─────────────────────────────────────────────
  genderMale: "getByRole('radio', { name: 'Male' })",
  genderFemale: "getByRole('radio', { name: 'Female' })",
  dobField: "input[placeholder='yyyy-dd-mm']",
  nationalityDropdown: "getByLabel('Nationality')",
} as const;

// ── Step 2: Define scopes — containers that restrict locator matching ──────────
// This prevents "Save" button in header matching instead of form Save button
const SCOPE = {
  form: '.oxd-form',
  table: '.oxd-table',
  dialog: '.oxd-dialog-container',
  header: '.oxd-topbar',
} as const;

// ── Step 3: Define the page class ─────────────────────────────────────────────
export class EmployeePage extends BasePage {
  protected url = '/web/index.php/pim/viewEmployeeList';
  protected pageIdentifier = Locators.addEmployeeMenu;

  constructor(page: Page, testName = 'Employee Page') {
    super(page, testName);
  }

  // ── Step 4: Define step groups — each method = one logical workflow ──────────

  /**
   * Steps to navigate to Employee List from anywhere in the app.
   * Always start navigation from a known state.
   */
  navigateToEmployeeListSteps(): Step[] {
    return [
      {
        label: 'Click PIM menu',
        action: 'click',
        codegenLocator: Locators.pimMenu,
        timeout: 15000,
        description: 'Open the PIM module from top navigation',
      },
      {
        label: 'Click Employee List',
        action: 'click',
        codegenLocator: Locators.employeeListMenu,
        timeout: 10000,
        description: 'Navigate to Employee List page',
      },
      {
        label: 'Verify Employee List loaded',
        action: 'assertVisible',
        codegenLocator: Locators.addEmployeeMenu,
        timeout: 15000,
        description: 'Confirm Employee List page is loaded',
      },
    ];
  }

  /**
   * Steps to add a new employee.
   * Uses TestDataManager for unique data — prevents duplicate conflicts.
   */
  addEmployeeSteps(firstName: string, lastName: string, employeeId?: string): Step[] {
    return [
      {
        label: 'Click Add Employee',
        action: 'click',
        codegenLocator: Locators.addEmployeeMenu,
        description: 'Open Add Employee form',
      },
      {
        label: 'Fill First Name',
        action: 'fill',
        locator: Locators.firstNameField,
        value: firstName,
        scope: SCOPE.form,
        description: 'Enter employee first name',
      },
      {
        label: 'Fill Last Name',
        action: 'fill',
        locator: Locators.lastNameField,
        value: lastName,
        scope: SCOPE.form,
        description: 'Enter employee last name',
      },
      // Only fill employee ID if provided — optional field
      ...(employeeId
        ? [
            {
              label: 'Fill Employee ID',
              action: 'fill' as const,
              locator: Locators.employeeIdField,
              value: employeeId,
              scope: SCOPE.form,
              description: 'Enter custom employee ID',
            },
          ]
        : []),
      {
        label: 'Save new employee',
        action: 'click',
        codegenLocator: Locators.saveButton,
        scope: SCOPE.form,
        description: 'Submit the Add Employee form',
      },
      {
        label: 'Verify employee saved',
        action: 'assertVisible',
        codegenLocator: "getByText('Successfully Saved')",
        timeout: 8000,
        description: 'Confirm employee was created successfully',
      },
    ];
  }

  /**
   * Steps to search for an employee by name.
   */
  searchEmployeeSteps(employeeName: string): Step[] {
    return [
      {
        label: 'Fill employee name search',
        action: 'fill',
        codegenLocator: Locators.searchNameField,
        value: employeeName,
        description: 'Type employee name in search field',
      },
      {
        label: 'Click Search',
        action: 'click',
        codegenLocator: Locators.searchButton,
        description: 'Execute employee search',
      },
      {
        label: 'Wait for search results',
        action: 'waitForNetwork',
        description: 'Wait for search results to load',
      },
    ];
  }

  /**
   * Steps to verify an employee appears in search results.
   * Uses soft assertion — test continues even if this check fails.
   */
  verifyEmployeeInListSteps(employeeName: string): Step[] {
    return [
      {
        label: `Verify ${employeeName} in list`,
        action: 'assertVisible',
        codegenLocator: `getByText('${employeeName}')`,
        scope: SCOPE.table,
        description: `Confirm ${employeeName} appears in employee list`,
      },
    ];
  }

  /**
   * Steps to delete an employee (requires confirmation dialog).
   */
  deleteEmployeeSteps(employeeName: string): Step[] {
    return [
      // First search for the employee
      ...this.searchEmployeeSteps(employeeName),
      {
        label: `Verify ${employeeName} found`,
        action: 'assertVisible',
        codegenLocator: `getByText('${employeeName}')`,
        scope: SCOPE.table,
        timeout: 8000,
      },
      {
        label: 'Click Delete button',
        action: 'click',
        codegenLocator: Locators.deleteButton,
        scope: SCOPE.table,
        description: 'Click delete on the employee row',
      },
      {
        label: 'Verify delete dialog visible',
        action: 'assertVisible',
        codegenLocator: Locators.dialogTitle,
        timeout: 5000,
      },
      {
        label: 'Confirm delete',
        action: 'click',
        codegenLocator: Locators.confirmDeleteButton,
        scope: SCOPE.dialog,
        description: 'Confirm deletion in dialog',
      },
      {
        label: 'Verify employee deleted',
        action: 'assertVisible',
        codegenLocator: "getByText('Successfully Deleted')",
        timeout: 8000,
      },
    ];
  }

  /**
   * Steps to verify form validation errors.
   * Used in negative test cases.
   */
  verifyValidationErrorSteps(): Step[] {
    return [
      {
        label: 'Click Save without data',
        action: 'click',
        codegenLocator: Locators.saveButton,
        scope: SCOPE.form,
      },
      {
        label: 'Verify required field error',
        action: 'assertVisible',
        locator: Locators.validationError,
        description: 'Confirm validation error appears for required fields',
      },
    ];
  }

  // ── Step 5: High-level helper methods ─────────────────────────────────────────
  // These combine step groups for common workflows

  /**
   * Navigate to Employee List — call at start of every employee test.
   */
  async goToEmployeeList(): Promise<void> {
    const result = await this.run(
      this.navigateToEmployeeListSteps(),
      'Navigate to Employee List',
      'general',
      { workflowRetries: 1 }
    );
    if (result.failed > 0) {
      throw new Error('Failed to navigate to Employee List');
    }
    Logger.success('On Employee List page');
  }

  /**
   * Add employee and return the employee ID for later use.
   */
  async addEmployee(firstName: string, lastName: string): Promise<string> {
    const employeeId = TestDataManager.uniqueId('EMP');

    const result = await this.run(
      this.addEmployeeSteps(firstName, lastName, employeeId),
      `Add Employee: ${firstName} ${lastName}`,
      'regression',
      { workflowRetries: 1, maxWorkflowMs: 30000 }
    );

    if (result.failed > 0) {
      throw new Error(`Failed to add employee: ${firstName} ${lastName}`);
    }

    Logger.success(`Employee added: ${firstName} ${lastName} (ID: ${employeeId})`);
    return employeeId;
  }

  /**
   * Get count of employees currently shown in the table.
   */
  async getEmployeeCount(): Promise<number> {
    return this.count(Locators.tableRows);
  }

  /**
   * Check if an employee exists in the current list.
   */
  async employeeExists(name: string): Promise<boolean> {
    return this.isVisible(`${SCOPE.table} >> text=${name}`);
  }
}
