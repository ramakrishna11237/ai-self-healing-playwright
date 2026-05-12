export type ActionType =
  // ── Navigation ──────────────────────────────────────────────────────────────
  | 'navigate'
  | 'reload'
  | 'goBack'
  | 'goForward'
  | 'newTab'
  | 'closeTab'
  | 'switchTab'
  | 'navigateAndWait'
  | 'openInNewTab'
  | 'printPage'
  | 'printToPdf'
  | 'savePageSource'
  // ── Auth ────────────────────────────────────────────────────────────────────
  | 'login'
  | 'logout'
  // ── Mouse ───────────────────────────────────────────────────────────────────
  | 'click'
  | 'doubleClick'
  | 'rightClick'
  | 'hover'
  | 'dragDrop'
  | 'tap'
  | 'dragDropCoords'
  | 'hoverAndWait'
  | 'pressAndHold'
  | 'mouseMove'
  | 'clickWithModifier'
  | 'clickOffset'
  | 'mouseDown'
  | 'mouseUp'
  | 'mouseWheel'
  | 'tripleClick'
  // ── Keyboard ────────────────────────────────────────────────────────────────
  | 'fill'
  | 'clearInput'
  | 'keyPress'
  | 'focus'
  | 'blur'
  | 'selectAll'
  | 'typeSlowly'
  | 'selectText'
  | 'pressKey'
  | 'keyDown'
  | 'keyUp'
  | 'clearAndType'
  | 'typeIntoActiveElement'
  | 'keyCombo'
  | 'keySequence'
  // ── Forms ───────────────────────────────────────────────────────────────────
  | 'submit'
  | 'dropdown'
  | 'multiSelect'
  | 'check'
  | 'uncheck'
  | 'upload'
  | 'fileDownload'
  | 'multiFileUpload'
  | 'selectByIndex'
  | 'selectByValue'
  | 'toggleCheckbox'
  | 'fillDate'
  | 'fillTime'
  | 'fillDateTime'
  | 'radioSelect'
  | 'rangeSlider'
  // ── DOM / JS ─────────────────────────────────────────────────────────────────
  | 'dispatchEvent'
  | 'evaluate'
  | 'executeAsyncScript'
  | 'addScriptTag'
  | 'addStyleTag'
  | 'clipboardCopy'
  | 'clipboardPaste'
  | 'pasteText'
  // ── Browser context ──────────────────────────────────────────────────────────
  | 'geolocation'
  | 'emulateMedia'
  | 'setViewport'
  | 'mockDate'
  | 'networkThrottle'
  | 'setPermission'
  | 'grantPermission'
  | 'denyPermission'
  | 'blockRequest'
  | 'unblockRequest'
  | 'clearRoutes'
  // ── Storage ──────────────────────────────────────────────────────────────────
  | 'setCookie'
  | 'getCookie'
  | 'clearCookies'
  | 'setLocalStorage'
  | 'clearLocalStorage'
  | 'getLocalStorage'
  | 'setSessionStorage'
  | 'getSessionStorage'
  | 'clearSessionStorage'
  // ── Rich text / editor ───────────────────────────────────────────────────────
  | 'richTextClick'
  | 'richTextType'
  | 'richTextClear'
  // ── API / network ────────────────────────────────────────────────────────────
  | 'interceptRequest'
  | 'mockApiResponse'
  | 'waitForRequest'
  | 'waitForResponse'
  | 'apiGet'
  | 'apiPost'
  | 'apiPut'
  | 'apiDelete'
  | 'apiAssertResponse'
  // ── Visual / accessibility ───────────────────────────────────────────────────
  | 'assertSnapshot'
  | 'assertAccessibility'
  | 'assertNoConsoleErrors'
  | 'compareScreenshot'
  | 'captureFullPage'
  | 'captureViewport'
  | 'highlightElement'
  // ── Performance / tracing ────────────────────────────────────────────────────
  | 'measurePerformance'
  | 'startTrace'
  | 'stopTrace'
  | 'captureHar'
  // ── Scroll ───────────────────────────────────────────────────────────────────
  | 'scrollToBottom'
  | 'scrollToTop'
  | 'scrollByPercent'
  // ── Window / frame ───────────────────────────────────────────────────────────
  | 'resizeWindow'
  | 'maximizeWindow'
  | 'switchToFrame'
  | 'switchToMainFrame'
  // ── Mobile ───────────────────────────────────────────────────────────────────
  | 'swipe'
  | 'pinchZoom'
  | 'rotate'
  | 'shake'
  | 'setOrientation'
  | 'touchStart'
  | 'touchEnd'
  | 'touchMove'
  // ── Conditional ──────────────────────────────────────────────────────────────
  | 'ifVisible'
  | 'ifExists'
  | 'repeatUntil'
  // ── Data extraction ──────────────────────────────────────────────────────────
  | 'extractText'
  | 'extractAttribute'
  | 'extractAllText'
  | 'extractTableData'
  | 'getPageSource'
  | 'getBrowserLogs'
  | 'clearBrowserLogs'
  // ── Table ────────────────────────────────────────────────────────────────────
  | 'tableGetCell'
  | 'tableAssertRow'
  | 'tableGetRowCount'
  // ── Search ───────────────────────────────────────────────────────────────────
  | 'search'
  // ── Assertions ───────────────────────────────────────────────────────────────
  | 'validation'
  | 'assertUrl'
  | 'assertTitle'
  | 'assertVisible'
  | 'assertHidden'
  | 'assertCount'
  | 'assertAttribute'
  | 'assertText'
  | 'assertValue'
  | 'assertChecked'
  | 'assertUnchecked'
  | 'assertEnabled'
  | 'assertDisabled'
  | 'assertHasClass'
  | 'assertInViewport'
  | 'assertEditable'
  | 'assertFocused'
  | 'assertPattern'
  | 'assertContainsText'
  | 'assertNotContainsText'
  | 'assertGreaterThan'
  | 'assertLessThan'
  | 'assertEmpty'
  | 'assertNotEmpty'
  | 'assertExists'
  | 'assertNotExists'
  | 'assertStyle'
  | 'assertCssProperty'
  | 'assertPageSource'
  | 'assertUrlMatches'
  | 'assertTitleMatches'
  | 'assertTextMatches'
  | 'assertValueMatches'
  | 'assertAttributeMatches'
  | 'assertResponseStatus'
  | 'assertLocalStorage'
  | 'assertCookie'
  | 'assertConsoleLog'
  // ── Waits ────────────────────────────────────────────────────────────────────
  | 'wait'
  | 'waitForUrl'
  | 'waitForText'
  | 'waitForNetwork'
  | 'waitForFunction'
  | 'waitForSelector'
  | 'waitForDownload'
  | 'waitForVisible'
  | 'waitForHidden'
  | 'waitForCount'
  | 'waitForAnimation'
  | 'waitForLoadState'
  | 'waitForPageLoad'
  | 'waitForTextChange'
  | 'waitForAttributeChange'
  | 'waitForValueChange'
  // ── Screenshot / page ────────────────────────────────────────────────────────
  | 'screenshot'
  | 'screenshotElement'
  | 'scroll'
  | 'scrollTo'
  // ── iframe / alert / PDF ─────────────────────────────────────────────────────
  | 'iframe'
  | 'alert'
  | 'assertPdf';

export type SuiteType = 'smoke' | 'sanity' | 'regression' | 'general';

export interface Step {
  label: string;
  action?: ActionType;
  description?: string;

  // Locators
  locator?: string;
  codegenLocator?: string;

  // Auth
  username?: string;
  password?: string;

  // Input
  text?: string;
  value?: string;
  values?: string[];

  // Validation
  expectedText?: string;
  expectedUrl?: string;
  expectedTitle?: string;
  expectedCount?: number;
  expectedAttribute?: string;
  attributeName?: string;

  // Form
  options?: string[];

  // Keyboard
  key?: string;
  delay?: number;

  // Mouse
  dragTo?: string;

  // Scroll
  scrollDirection?: 'up' | 'down' | 'left' | 'right' | 'top' | 'bottom';
  scrollAmount?: number;

  // Screenshot
  screenshotName?: string;

  // Wait
  waitMs?: number;

  // File
  filePath?: string;

  // iframe
  iframeLocator?: string;

  // Alert
  alertAction?: 'accept' | 'dismiss' | 'fill';
  alertText?: string;

  // Tab
  tabIndex?: number;

  // Scope — restrict locator to a specific container element (CSS selector)
  scope?: string;

  // Soft assertion — when true, failure is recorded but workflow continues
  soft?: boolean;

  // Tap (mobile touch)
  tapPosition?: { x: number; y: number };

  // dispatchEvent — fire a custom DOM event on the element
  eventType?: string; // e.g. 'click', 'input', 'change', 'custom-event'
  eventInit?: Record<string, unknown>; // EventInit properties

  // evaluate — run JS expression in browser context (result stored in extra.evalResult)
  expression?: string; // JS expression string, e.g. "document.title"

  // waitForFunction — wait until a JS expression returns truthy
  // uses expression field above

  // waitForSelector — wait for a CSS selector to appear/disappear
  waitForState?: 'attached' | 'detached' | 'visible' | 'hidden';

  // Clipboard
  clipboardText?: string; // text to write to clipboard for clipboardPaste

  // Geolocation mock
  latitude?: number;
  longitude?: number;
  accuracy?: number;

  // Media emulation
  colorScheme?: 'light' | 'dark' | 'no-preference';
  media?: 'screen' | 'print';

  // assertPattern — regex validation on element text or input value
  pattern?: string; // regex string e.g. "^ACC-\\d{4}-\\d{6}$"
  patternFlags?: string; // regex flags e.g. "i"

  // assertPdf — PDF content verification
  pdfTriggerLocator?: string; // locator to click to trigger download (if not using filePath)
  pdfExpectedTexts?: string[]; // texts that must appear in the PDF
  pdfPatterns?: Record<string, string>; // label → regex string for value extraction
  pdfMinPages?: number;
  pdfMaxPages?: number;

  // healHint — manual locator placed at front of heal candidates
  // Use for elements hard to auto-heal: shadow DOM, iframes, dynamic IDs
  // Examples:
  //   healHint: "pierce/input.save-field"   ← shadow DOM
  //   healHint: "#stable-known-id"          ← stable fallback
  //   healHint: "[data-cy='save-btn']"      ← cypress-style test attr
  healHint?: string;

  // General
  timeout?: number;
  extra?: Record<string, unknown>;

  // dragDropCoords — drag by pixel coordinates
  sourceX?: number;
  sourceY?: number;
  targetX?: number;
  targetY?: number;

  // hoverAndWait — hover then wait for tooltip/submenu
  hoverWaitMs?: number;

  // pressAndHold — long press duration
  holdMs?: number;

  // mouseMove — move mouse to coordinates
  mouseX?: number;
  mouseY?: number;

  // selectText — select text range in input
  selectionStart?: number;
  selectionEnd?: number;

  // multiFileUpload — upload multiple files
  filePaths?: string[];

  // setViewport — change viewport mid-test
  viewportWidth?: number;
  viewportHeight?: number;

  // mockDate — mock system date
  mockDateValue?: string; // ISO date string e.g. "2026-01-15T10:00:00Z"

  // networkThrottle — simulate slow network
  networkProfile?: 'offline' | 'slow3g' | 'fast3g' | '4g' | 'reset';

  // assertGreaterThan / assertLessThan — numeric assertions
  expectedNumber?: number;

  // assertContainsText / assertNotContainsText
  notExpectedText?: string;

  // tableGetCell — get specific table cell
  tableRow?: number;
  tableCol?: number;
  tableLocator?: string;

  // tableAssertRow — assert row text exists in table
  tableRowText?: string;

  // waitForDownload — wait for file download
  downloadTimeout?: number;
  downloadSavePath?: string;

  // waitForVisible / waitForHidden — explicit wait actions
  waitLocator?: string;

  // keyCombo — keyboard shortcut e.g. "Control+Shift+I"
  keyCombo?: string;

  // keySequence — type multiple keys in sequence e.g. ["Tab","Tab","Enter"]
  keySequence?: string[];

  // scrollByPercent — scroll to % of page
  scrollPercent?: number;

  // Cookie actions
  cookieName?: string;
  cookieValue?: string;
  cookieDomain?: string;

  // localStorage actions
  storageKey?: string;
  storageValue?: string;

  // API intercept / mock
  urlPattern?: string;
  mockStatus?: number;
  mockBody?: unknown;
  mockHeaders?: Record<string, string>;

  // waitForRequest / waitForResponse
  requestTimeout?: number;

  // extractText / extractAttribute / extractAllText
  extractTarget?: string; // locator to extract from
  extractAttr?: string; // attribute name to extract
  extractKey?: string; // key to store result in step.extra

  // extractTableData — extract full table as array of objects
  tableHeaderLocator?: string;
  tableBodyLocator?: string;

  // ifVisible / ifExists — conditional execution
  conditionLocator?: string;
  thenAction?: ActionType;
  thenStep?: Partial<Step>;

  // repeatUntil — repeat action until condition is met
  repeatAction?: ActionType;
  repeatStep?: Partial<Step>;
  untilLocator?: string;
  maxRepeat?: number;

  // waitForCount — wait until element count matches
  waitCount?: number;

  // assertEmpty / assertNotEmpty
  // uses existing locator fields

  // assertExists / assertNotExists — DOM presence (not visibility)
  // uses existing locator fields

  // assertNoConsoleErrors — check browser console
  consoleErrorPattern?: string; // regex to match against console errors

  // richText — contenteditable / TinyMCE / Quill
  richTextLocator?: string;

  // switchToFrame
  frameIndex?: number;
  frameName?: string;
  frameUrl?: string;

  // screenshotElement — screenshot of specific element
  elementScreenshotName?: string;

  // clickWithModifier — click with Shift/Ctrl/Alt/Meta held
  modifierKey?: 'Shift' | 'Control' | 'Alt' | 'Meta';

  // clickOffset — click at offset from element center
  offsetX?: number;
  offsetY?: number;

  // mouseWheel — scroll wheel delta
  wheelDeltaX?: number;
  wheelDeltaY?: number;

  // keyDown / keyUp — hold a key
  holdKey?: string;

  // selectByIndex / selectByValue
  selectIndex?: number;
  selectValue?: string;

  // fillDate / fillTime / fillDateTime
  dateValue?: string;
  timeValue?: string;
  dateTimeValue?: string;

  // rangeSlider — set slider value
  sliderValue?: number;

  // radioSelect — select radio by value/label
  radioValue?: string;

  // executeAsyncScript
  asyncScript?: string;
  asyncScriptArgs?: unknown[];

  // addScriptTag / addStyleTag
  scriptUrl?: string;
  scriptContent?: string;
  styleUrl?: string;
  styleContent?: string;

  // pasteText — paste text directly
  pasteValue?: string;

  // setPermission / grantPermission / denyPermission
  permission?: string;
  permissionOrigin?: string;

  // blockRequest / unblockRequest
  blockPattern?: string;

  // getLocalStorage / getSessionStorage
  // uses storageKey field

  // setSessionStorage / clearSessionStorage
  sessionStorageKey?: string;
  sessionStorageValue?: string;

  // API actions
  apiUrl?: string;
  apiMethod?: string;
  apiBody?: unknown;
  apiHeaders?: Record<string, string>;
  apiExpectedStatus?: number;
  apiExpectedBody?: unknown;
  apiAuthToken?: string;

  // assertStyle / assertCssProperty
  cssProperty?: string;
  expectedCssValue?: string;

  // assertUrlMatches / assertTitleMatches / assertTextMatches
  // uses pattern field

  // assertResponseStatus
  responseStatusCode?: number;

  // assertLocalStorage / assertCookie / assertConsoleLog
  assertStorageKey?: string;
  assertStorageValue?: string;
  assertCookieName?: string;
  assertCookieValue?: string;
  assertLogMessage?: string;

  // waitForAnimation
  animationTimeout?: number;

  // waitForLoadState
  loadState?: 'load' | 'domcontentloaded' | 'networkidle';

  // waitForTextChange / waitForAttributeChange / waitForValueChange
  previousText?: string;
  previousValue?: string;
  previousAttributeValue?: string;

  // compareScreenshot
  baselineScreenshot?: string;
  screenshotThreshold?: number;

  // captureHar
  harPath?: string;

  // measurePerformance
  performanceMetric?: 'FCP' | 'LCP' | 'CLS' | 'TTI' | 'TTFB' | 'domLoad' | 'pageLoad';
  performanceThresholdMs?: number;

  // startTrace / stopTrace
  traceName?: string;

  // Mobile
  swipeDirection?: 'up' | 'down' | 'left' | 'right';
  swipeDistance?: number;
  swipeSpeed?: number;
  pinchScale?: number;
  orientation?: 'portrait' | 'landscape';
  touchX?: number;
  touchY?: number;

  // navigateAndWait
  waitAfterNavigate?: number;

  // openInNewTab
  newTabUrl?: string;

  // printToPdf
  pdfOutputPath?: string;

  // savePageSource
  pageSourcePath?: string;

  // getBrowserLogs
  logLevel?: 'all' | 'error' | 'warning' | 'info';

  // highlightElement
  highlightColor?: string;
  highlightDuration?: number;
}

export interface StepResult {
  success: boolean;
  layer: 'codegen' | 'pattern' | 'strategy' | 'learned' | 'selfheal' | 'direct' | 'none';
  locatorUsed?: string;
  error?: string;
  durationMs?: number;
  screenshotPath?: string;
  retryCount?: number;
  healConfidence?: number;
  healCandidatesTried?: number;
  healVerified?: boolean; // true = post-action page state confirmed correct
}
