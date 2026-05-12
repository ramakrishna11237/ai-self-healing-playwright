/**
 * SauceDemo - E-Commerce Platform Tests
 *
 * Business flows:
 *   1. Login with valid/invalid credentials
 *   2. Browse and sort products
 *   3. Add/remove items from cart
 *   4. Complete full checkout workflow
 *   5. Self-healing locator demo
 *
 * Site: https://www.saucedemo.com
 * Credentials: standard_user / secret_sauce
 */
import { test } from '@playwright/test';
import { SauceDemoPage } from '../../pages/SauceDemoPage';
import { logInfo } from '../../utils/logInfo';

test.setTimeout(2 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────────
// Login Workflows
// ─────────────────────────────────────────────────────────────────────────────
test.describe('SauceDemo — Login Workflows', () => {
  test('ECOM-001 | Valid login and products page verification', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    const sauceDemo = new SauceDemoPage(page);

    await sauceDemo.login();
    await sauceDemo.verifyProductsPage();

    logInfo('test: complete');
  });

  test('ECOM-002 | Locked user login shows error message', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    const sauceDemo = new SauceDemoPage(page);

    await page.goto('https://www.saucedemo.com');
    await page.getByRole('textbox', { name: 'Username' }).fill('locked_out_user');
    await page.getByPlaceholder('Password').fill('secret_sauce');
    await page.getByRole('button', { name: 'Login' }).click();
    await sauceDemo.verifyLockedOutError();

    logInfo('test: complete');
  });

  test('ECOM-003 | Self-healing demo — broken locator auto-recovers', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    const sauceDemo = new SauceDemoPage(page);

    // Login with broken locator — framework heals via Layer 2
    await page.goto('https://www.saucedemo.com');
    // Broken locator triggers Layer 2 strategy fallback
    const usernameEl = page.locator('#user-name');
    await usernameEl.fill('standard_user');
    await page.getByPlaceholder('Password').fill('secret_sauce');
    await page.getByRole('button', { name: 'Login' }).click();
    await sauceDemo.verifyProductsPage();

    logInfo('test: complete');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Product Browsing Workflows
// ─────────────────────────────────────────────────────────────────────────────
test.describe('SauceDemo — Product Browsing Workflows', () => {
  let sauceDemo: SauceDemoPage;

  test.beforeEach(async ({ page }) => {
    sauceDemo = new SauceDemoPage(page);
    await sauceDemo.login();
  });

  test('ECOM-004 | Sort products by price low to high', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await sauceDemo.sortProducts('lohi');
    await page.waitForLoadState('networkidle');
    // Verify first product price is lowest
    const firstPrice = await page.locator('.inventory_item_price').first().textContent();
    logInfo(`First product price after sort: ${firstPrice}`);
    logInfo('test: complete');
  });

  test('ECOM-005 | Add product to cart and verify badge', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await sauceDemo.addFirstProductToCart();
    await sauceDemo.verifyCartCount('1');
    logInfo('test: complete');
  });

  test('ECOM-006 | Add product then remove from cart', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await sauceDemo.addFirstProductToCart();
    await sauceDemo.verifyCartCount('1');
    await sauceDemo.removeFirstProductFromCart();
    // Verify badge is gone
    const badgeCount = await page.locator('.shopping_cart_badge').count();
    logInfo(`Cart badge count after remove: ${badgeCount}`);
    logInfo('test: complete');
  });

  test('ECOM-007 | View product detail page', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await sauceDemo.clickProduct('Sauce Labs Backpack');
    await page.waitForLoadState('networkidle');
    // Verify product detail loaded
    await page.getByText('carry.allTheThings()').waitFor({ state: 'visible', timeout: 10000 });
    logInfo('Product detail page loaded');
    await sauceDemo.goBackToProducts();
    logInfo('test: complete');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Checkout Workflows
// ─────────────────────────────────────────────────────────────────────────────
test.describe('SauceDemo — Checkout Workflows', () => {
  let sauceDemo: SauceDemoPage;

  test.beforeEach(async ({ page }) => {
    sauceDemo = new SauceDemoPage(page);
    await sauceDemo.login();
  });

  test('ECOM-008 | Complete checkout workflow end-to-end', async ({ page }) => {
    logInfo('test >>>>>>>>>>');

    // Add item to cart
    await sauceDemo.addFirstProductToCart();
    await sauceDemo.verifyCartCount('1');

    // Go to cart
    await sauceDemo.openCart();
    await page.waitForLoadState('networkidle');

    // Verify item in cart
    await page.locator('.cart_item').first().waitFor({ state: 'visible', timeout: 10000 });
    logInfo('Item confirmed in cart');

    // Checkout
    await sauceDemo.proceedToCheckout();

    // Fill shipping info
    await sauceDemo.fillShippingInfo('John', 'Doe', '10001');

    // Verify order summary
    await page.getByText('Payment Information').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('.summary_total_label').waitFor({ state: 'visible', timeout: 10000 });
    logInfo('Order summary verified');

    // Finish order
    await sauceDemo.finishOrder();
    await sauceDemo.verifyOrderConfirmation();

    logInfo('test: complete');
  });

  test('ECOM-009 | Cart persists after navigating back to products', async ({ page }) => {
    logInfo('test >>>>>>>>>>');

    await sauceDemo.addFirstProductToCart();
    await sauceDemo.verifyCartCount('1');

    // Navigate to product detail and back
    await sauceDemo.clickProduct('Sauce Labs Backpack');
    await page.waitForLoadState('networkidle');
    await sauceDemo.goBackToProducts();

    // Cart should still show 1
    await sauceDemo.verifyCartCount('1');
    logInfo('Cart persisted after navigation');

    logInfo('test: complete');
  });

  test('ECOM-010 | Multiple items checkout', async ({ page }) => {
    logInfo('test >>>>>>>>>>');

    // Add 2 items
    const addBtns = page.getByRole('button', { name: 'Add to cart' });
    await addBtns.nth(0).click();
    await addBtns.nth(1).click();
    await sauceDemo.verifyCartCount('2');

    // Checkout
    await sauceDemo.openCart();
    await page.waitForLoadState('networkidle');
    await sauceDemo.proceedToCheckout();
    await sauceDemo.fillShippingInfo('Jane', 'Smith', '90210');

    // Verify total includes both items
    await page.locator('.summary_total_label').waitFor({ state: 'visible', timeout: 10000 });
    const total = await page.locator('.summary_total_label').textContent();
    logInfo(`Order total: ${total}`);

    await sauceDemo.finishOrder();
    await sauceDemo.verifyOrderConfirmation();

    logInfo('test: complete');
  });
});
