/**
 * SauceDemoPage
 *
 * Page object for SauceDemo e-commerce application.
 * URL: https://www.saucedemo.com
 * Credentials: standard_user / secret_sauce
 *
 * All locators centralised here — specs contain zero raw locators.
 * Follows exact same pattern as OrangeHRMPage.
 */
import { Page } from '@playwright/test';
import { HealingPage } from '../utils/HealingPage';
import { logInfo } from '../utils/logInfo';

const APP_URL = 'https://www.saucedemo.com';
const USERNAME = 'standard_user';
const PASSWORD = 'secret_sauce';

const Locators = {
  // Login
  usernameField: "getByRole('textbox', { name: 'Username' })",
  passwordField: "getByPlaceholder('Password')",
  loginButton: "getByRole('button', { name: 'Login' })",

  // Products page
  productsHeader: "getByText('Products')",
  sortDropdown: "getByRole('combobox')",
  addToCartBtn: "getByRole('button', { name: 'Add to cart' })",
  removeBtn: "getByRole('button', { name: 'Remove' })",
  cartBadge: '.shopping_cart_badge',
  cartLink: '.shopping_cart_link',
  menuBtn: "getByRole('button', { name: 'Open Menu' })",

  // Product detail
  backToProductsBtn: "getByRole('button', { name: 'Back to products' })",
  productTitle: '.inventory_details_name',

  // Cart page
  checkoutBtn: "getByRole('button', { name: 'Checkout' })",
  cartItem: '.cart_item',

  // Checkout step 1
  firstNameField: "getByRole('textbox', { name: 'First Name' })",
  lastNameField: "getByRole('textbox', { name: 'Last Name' })",
  zipCodeField: "getByRole('textbox', { name: 'Zip/Postal Code' })",
  continueBtn: "getByRole('button', { name: 'Continue' })",

  // Checkout step 2
  paymentInfo: "getByText('Payment Information')",
  totalPrice: "getByText('Total:')",
  finishBtn: "getByRole('button', { name: 'Finish' })",

  // Order confirmation
  thankYouMsg: "getByText('Thank you for your order!')",
  backHomeBtn: "getByRole('button', { name: 'Back Home' })",

  // Error
  errorMsg: "[data-test='error']",
  lockedOutError: "getByText('Epic sadface: Sorry, this user has been locked out')",
} as const;

export class SauceDemoPage {
  private hp: HealingPage;

  constructor(private page: Page) {
    this.hp = new HealingPage(page);
  }

  /** Login to SauceDemo */
  async login(username = USERNAME, password = PASSWORD): Promise<void> {
    logInfo('Login: navigating to SauceDemo');
    await this.hp.goto(APP_URL);
    await this.hp.fill(Locators.usernameField, 'Username', username);
    await this.hp.fill(Locators.passwordField, 'Password', password);
    await this.hp.click(Locators.loginButton, 'Login button');
    await this.hp.waitForVisible(Locators.productsHeader, 'Products page loaded');
    logInfo('Login: success');
  }

  /** Verify products page is loaded */
  async verifyProductsPage(): Promise<void> {
    logInfo('Verify: checking products page');
    await this.hp.assertVisible(Locators.productsHeader, 'Products header');
    logInfo('Verify: products page confirmed');
  }

  /** Sort products */
  async sortProducts(value: string): Promise<void> {
    logInfo(`Sort: sorting products by ${value}`);
    await this.page.locator('select.product_sort_container').selectOption(value);
    logInfo('Sort: complete');
  }

  /** Add first product to cart */
  async addFirstProductToCart(): Promise<void> {
    logInfo('Cart: adding first product to cart');
    await this.hp.click(Locators.addToCartBtn, 'Add to cart button');
    logInfo('Cart: product added');
  }

  /** Remove first product from cart */
  async removeFirstProductFromCart(): Promise<void> {
    logInfo('Cart: removing first product from cart');
    await this.hp.click(Locators.removeBtn, 'Remove button');
    logInfo('Cart: product removed');
  }

  /** Click on a product by name */
  async clickProduct(name: string): Promise<void> {
    logInfo(`Product: clicking on "${name}"`);
    await this.page.getByText(name).first().click();
    logInfo(`Product: "${name}" opened`);
  }

  /** Go back to products from detail page */
  async goBackToProducts(): Promise<void> {
    logInfo('Navigation: going back to products');
    await this.hp.click(Locators.backToProductsBtn, 'Back to products');
    await this.hp.waitForVisible(Locators.productsHeader, 'Products page');
    logInfo('Navigation: back on products page');
  }

  /** Open cart */
  async openCart(): Promise<void> {
    logInfo('Cart: opening cart');
    await this.page.locator(Locators.cartLink).click();
    await this.page.waitForLoadState('networkidle');
    logInfo('Cart: opened');
  }

  /** Proceed to checkout */
  async proceedToCheckout(): Promise<void> {
    logInfo('Checkout: proceeding to checkout');
    await this.hp.click(Locators.checkoutBtn, 'Checkout button');
    await this.page.waitForLoadState('networkidle');
    logInfo('Checkout: step 1 loaded');
  }

  /** Fill shipping information */
  async fillShippingInfo(firstName: string, lastName: string, zip: string): Promise<void> {
    logInfo(`Checkout: filling shipping info for ${firstName} ${lastName}`);
    await this.hp.fill(Locators.firstNameField, 'First Name', firstName);
    await this.hp.fill(Locators.lastNameField, 'Last Name', lastName);
    await this.hp.fill(Locators.zipCodeField, 'Zip Code', zip);
    await this.hp.click(Locators.continueBtn, 'Continue button');
    await this.page.waitForLoadState('networkidle');
    logInfo('Checkout: shipping info filled');
  }

  /** Complete order */
  async finishOrder(): Promise<void> {
    logInfo('Checkout: finishing order');
    await this.hp.click(Locators.finishBtn, 'Finish button');
    await this.page.waitForLoadState('networkidle');
    logInfo('Checkout: order placed');
  }

  /** Verify order confirmation */
  async verifyOrderConfirmation(): Promise<void> {
    logInfo('Verify: checking order confirmation');
    await this.hp.assertVisible(Locators.thankYouMsg, 'Thank you message');
    logInfo('Verify: order confirmed');
  }

  /** Verify cart badge count */
  async verifyCartCount(expected: string): Promise<void> {
    logInfo(`Verify: cart badge should show ${expected}`);
    await this.hp.assertVisible(`getByText('${expected}')`, `Cart badge ${expected}`);
    logInfo('Verify: cart count confirmed');
  }

  /** Verify locked out error */
  async verifyLockedOutError(): Promise<void> {
    logInfo('Verify: checking locked out error');
    await this.hp.assertVisible(Locators.lockedOutError, 'Locked out error');
    logInfo('Verify: locked out error confirmed');
  }
}
