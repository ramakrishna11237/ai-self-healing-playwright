import { Page } from '@playwright/test';
import { Step, ActionType } from '../types';
import { Logger } from '../utils/Logger';
import { routeAction } from './ActionRouter';

export function detectPattern(step: Step): ActionType {
  if (step.action) return step.action;

  const label = (step.label ?? '').toLowerCase();

  // Rich text
  if (label.includes('rich text clear') || label.includes('clear rich text'))
    return 'richTextClear';
  if (label.includes('rich text type') || label.includes('type in rich text'))
    return 'richTextType';
  if (label.includes('rich text')) return 'richTextClick';

  // Cookie / storage
  if (label.includes('clear cookies') || label.includes('delete cookies')) return 'clearCookies';
  if (label.includes('get cookie')) return 'getCookie';
  if (label.includes('set cookie')) return 'setCookie';
  if (label.includes('clear local storage') || label.includes('clear localstorage'))
    return 'clearLocalStorage';
  if (label.includes('set local storage') || label.includes('set localstorage'))
    return 'setLocalStorage';

  // API / network
  if (label.includes('mock api') || label.includes('mock response')) return 'mockApiResponse';
  if (label.includes('intercept request')) return 'interceptRequest';
  if (label.includes('wait for request')) return 'waitForRequest';
  if (label.includes('wait for response')) return 'waitForResponse';

  // Assertions
  if (label.includes('assert snapshot') || label.includes('check snapshot'))
    return 'assertSnapshot';
  if (label.includes('assert accessibility') || label.includes('check accessibility'))
    return 'assertAccessibility';
  if (label.includes('assert no console') || label.includes('no console errors'))
    return 'assertNoConsoleErrors';
  if (label.includes('assert not empty') || label.includes('should not be empty'))
    return 'assertNotEmpty';
  if (label.includes('assert empty') || label.includes('should be empty')) return 'assertEmpty';
  if (label.includes('assert not exists') || label.includes('should not exist'))
    return 'assertNotExists';
  if (label.includes('assert exists') || label.includes('should exist')) return 'assertExists';

  // Keyboard
  if (label.includes('key combo') || label.includes('keyboard shortcut')) return 'keyCombo';
  if (label.includes('key sequence') || label.includes('press keys')) return 'keySequence';

  // Scroll
  if (label.includes('scroll to bottom') || label.includes('scroll bottom'))
    return 'scrollToBottom';
  if (label.includes('scroll to top') || label.includes('scroll top')) return 'scrollToTop';
  if (label.includes('scroll by percent') || label.includes('scroll percent'))
    return 'scrollByPercent';

  // Window
  if (label.includes('maximize window') || label.includes('maximize browser'))
    return 'maximizeWindow';
  if (label.includes('resize window') || label.includes('resize browser')) return 'resizeWindow';
  if (label.includes('switch to main frame') || label.includes('main frame'))
    return 'switchToMainFrame';
  if (label.includes('switch to frame') || label.includes('switch frame')) return 'switchToFrame';

  // Conditional
  if (label.includes('if visible') || label.includes('click if visible')) return 'ifVisible';
  if (label.includes('if exists') || label.includes('click if exists')) return 'ifExists';
  if (label.includes('repeat until') || label.includes('retry until')) return 'repeatUntil';

  // Data extraction
  if (label.includes('extract table') || label.includes('get table data'))
    return 'extractTableData';
  if (label.includes('extract all text') || label.includes('get all text')) return 'extractAllText';
  if (label.includes('extract attribute') || label.includes('get attribute value'))
    return 'extractAttribute';
  if (label.includes('extract text') || label.includes('get text value')) return 'extractText';

  // Wait
  if (label.includes('wait for count') || label.includes('wait until count')) return 'waitForCount';

  // Screenshot element
  if (label.includes('screenshot element') || label.includes('capture element'))
    return 'screenshotElement';

  // Auth — check before generic "enter/type" matches
  if (label === 'login' || label.startsWith('login ') || label.endsWith(' login')) return 'login';
  if (label === 'logout' || label.startsWith('logout ') || label.endsWith(' logout'))
    return 'logout';

  // Navigation
  if (label.includes('navigate') || label.includes('go to') || label.includes('open url'))
    return 'navigate';
  if (label.includes('reload') || label.includes('refresh page')) return 'reload';
  if (label.includes('go back') || label.includes('navigate back')) return 'goBack';
  if (label.includes('go forward') || label.includes('navigate forward')) return 'goForward';
  if (label.includes('new tab') || label.includes('open tab')) return 'newTab';
  if (label.includes('close tab')) return 'closeTab';
  if (label.includes('switch tab')) return 'switchTab';

  // Mouse — specifics before generic "click"
  if (label.includes('double click') || label.includes('dblclick')) return 'doubleClick';
  if (label.includes('right click') || label.includes('context menu')) return 'rightClick';
  if (label.includes('hover and wait') || label.includes('hover then wait')) return 'hoverAndWait';
  if (label.includes('hover') || label.includes('mouse over')) return 'hover';
  if (label.includes('drag and drop coords') || label.includes('drag to coordinates'))
    return 'dragDropCoords';
  if (label.includes('drag')) return 'dragDrop';
  if (label.includes('press and hold') || label.includes('long press')) return 'pressAndHold';
  if (label.includes('mouse move') || label.includes('move mouse')) return 'mouseMove';
  if (
    label === 'tap' ||
    label.startsWith('tap ') ||
    label.endsWith(' tap') ||
    label.includes(' tap ')
  )
    return 'tap';

  // Keyboard / Input — specifics before generic "fill"
  if (label.includes('type slowly') || label.includes('slow type')) return 'typeSlowly';
  if (label.includes('press key') || label.includes('key press')) return 'keyPress';
  if (label.includes('press ') && label.includes('key')) return 'pressKey';
  if (label.includes('select all text')) return 'selectAll';
  if (label.includes('select text range') || label.includes('select text')) return 'selectText';
  if (label.includes('clear input') || label.includes('clear field') || label.includes('clear the'))
    return 'clearInput';
  if (label.includes('focus on') || label.startsWith('focus ')) return 'focus';
  if (label.includes('blur') || label.includes('unfocus')) return 'blur';
  if (label.includes('fill') || label.includes('type') || label.includes('enter text'))
    return 'fill';

  // Forms
  if (label.includes('multi select') || label.includes('multiselect')) return 'multiSelect';
  if (
    label.includes('dropdown') ||
    label.includes('select option') ||
    label.includes('select from')
  )
    return 'dropdown';
  if (label.includes('uncheck')) return 'uncheck';
  if (label.includes('check ') || label.endsWith('check')) return 'check';
  if (label.includes('upload') && (label.includes('multiple') || label.includes('files')))
    return 'multiFileUpload';
  if (label.includes('upload')) return 'upload';
  if (label.includes('download')) return 'fileDownload';
  if (label.includes('submit')) return 'submit';

  // Assertions — specifics before generic "assert/verify"
  if (label.includes('assert url') || label.includes('verify url') || label.includes('check url'))
    return 'assertUrl';
  if (label.includes('assert title') || label.includes('verify title')) return 'assertTitle';
  if (
    label.includes('assert visible') ||
    label.includes('should be visible') ||
    label.includes('is visible')
  )
    return 'assertVisible';
  if (
    label.includes('assert hidden') ||
    label.includes('should be hidden') ||
    label.includes('is hidden')
  )
    return 'assertHidden';
  if (label.includes('assert count') || label.includes('count should')) return 'assertCount';
  if (label.includes('assert attribute') || label.includes('check attribute'))
    return 'assertAttribute';
  if (label.includes('assert greater') || label.includes('greater than'))
    return 'assertGreaterThan';
  if (label.includes('assert less') || label.includes('less than')) return 'assertLessThan';
  if (label.includes('assert not contains') || label.includes('should not contain'))
    return 'assertNotContainsText';
  if (label.includes('assert contains') || label.includes('should contain'))
    return 'assertContainsText';
  if (label.includes('validate') || label.includes('verify') || label.includes('assert'))
    return 'validation';

  // Search
  if (label.includes('search')) return 'search';

  // Waits — specifics before generic "wait"
  if (label.includes('wait for download') || label.includes('download file'))
    return 'waitForDownload';
  if (label.includes('wait for visible') || label.includes('wait until visible'))
    return 'waitForVisible';
  if (label.includes('wait for hidden') || label.includes('wait until hidden'))
    return 'waitForHidden';
  if (label.includes('wait for url')) return 'waitForUrl';
  if (label.includes('wait for text')) return 'waitForText';
  if (label.includes('wait for network') || label.includes('network idle')) return 'waitForNetwork';
  if (label.includes('wait') || label.includes('pause') || label.includes('sleep')) return 'wait';

  if (label.includes('table get cell') || label.includes('get table cell')) return 'tableGetCell';
  if (label.includes('table assert row') || label.includes('table row exists'))
    return 'tableAssertRow';
  if (label.includes('table row count') || label.includes('count table rows'))
    return 'tableGetRowCount';
  if (label.includes('set viewport') || label.includes('change viewport')) return 'setViewport';
  if (label.includes('mock date') || label.includes('fake date')) return 'mockDate';
  if (label.includes('network throttle') || label.includes('slow network'))
    return 'networkThrottle';
  // Page utilities
  if (label.includes('screenshot') || label.includes('capture screen')) return 'screenshot';
  if (label.includes('scroll to ')) return 'scrollTo';
  if (label.includes('scroll')) return 'scroll';

  // Advanced
  if (label.includes('iframe') || label.includes('frame')) return 'iframe';
  if (label.includes('alert') || label.includes('dialog') || label.includes('popup'))
    return 'alert';

  return 'click';
}

export async function executePattern(
  page: Page,
  pattern: ActionType,
  step: Step
): Promise<boolean> {
  try {
    return await routeAction(page, pattern, step);
  } catch (e) {
    Logger.error(`executePattern failed: ${pattern} on "${step.label}"`, String(e));
    return false;
  }
}
