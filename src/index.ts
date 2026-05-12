/**
 * Unified API Gateway for AI Automation Framework
 */

// Core
export { runStep, runStepDetailed } from './core/Runner';
export { runSteps, runStepsParallel } from './core/WorkflowRunner';
export type { WorkflowResult, WorkflowOptions } from './core/WorkflowRunner';

// Engine
export { detectPattern, executePattern } from './engine/PatternEngine';
export { routeAction, registerAction, unregisterAction, listPlugins } from './engine/ActionRouter';
export { getLocatorStrategies } from './engine/LocatorEngine';
export { retryAction } from './engine/RetryEngine';
export {
  waitForElement,
  waitForPageStable,
  waitForUrlChange,
  waitForCountChange,
} from './engine/SmartWait';

// DOM
export { captureDOM } from './dom/DOMCapture';
export { getDOMDiff } from './dom/DOMDiff';
export { generateVisualDiff } from './dom/VisualDiff';
export { sanitizeDOM } from './dom/DOMSanitizer';
export { filterDOM } from './dom/SmartDOMFilter';

// Healing
export { selfHeal } from './healing/SelfHeal';

// Learning
export { updateFix, getAllFixes, clearFixes } from './learning/LearningStore';
export { getBestLocator, getBestLocatorWithScore } from './learning/FixApplier';
export type { LearnedFix } from './learning/LearningStore';

// Utils
export { Logger } from './utils/Logger';
export { PageHelper } from './utils/PageHelper';
export { PageHelperExtras } from './utils/PageHelperExtras';
export { PageHelperGenerator } from './utils/PageHelperGenerator';
export { NetworkInterceptor } from './utils/NetworkInterceptor';
export { SessionManager } from './utils/SessionManager';
export { VisualRegression } from './utils/VisualRegression';
export { AccessibilityChecker } from './utils/AccessibilityChecker';
export { ShadowDOMHelper } from './utils/ShadowDOMHelper';
export { TestReporter } from './utils/TestReporter';
export { DashboardReporter } from './utils/DashboardReporter';
export { ApiClient } from './utils/ApiClient';
export type { ApiRequestOptions, ApiResponse } from './utils/ApiClient';
export { ParallelSession } from './utils/ParallelSession';
export { ErrorLogger } from './utils/ErrorLogger';
export { StabilityGuard } from './utils/StabilityGuard';
export { TestDataManager } from './utils/TestDataManager';
export { Env } from './utils/Env';
export { MobileHelper } from './utils/MobileHelper';
export type { MobileDeviceName } from './utils/MobileHelper';
export { MOBILE_DEVICES } from './utils/MobileHelper';
export { PdfVerifier } from './utils/PdfVerifier';
export type { PdfVerifyResult } from './utils/PdfVerifier';
export { DebugMode } from './utils/DebugMode';
export { LabelSuggester } from './utils/LabelSuggester';

// Security
export { SecurityEnforcer } from './security/SecurityEnforcer';
export type { SecurityScanResult } from './security/SecurityEnforcer';

// Smart Engine (v2 upgrade)
export { SmartLocatorEngine } from './engine/SmartLocatorEngine';
export type { LocatorCandidate, SmartLocatorOptions } from './engine/SmartLocatorEngine';
export { SmartActions } from './engine/SmartActions';
export type { SmartActionOptions } from './engine/SmartActions';
export { SmartWaitEngine } from './engine/SmartWaitEngine';
export { FrameHandler } from './engine/FrameHandler';
export { StepObserver } from './utils/StepObserver';
export type { StepObservation } from './utils/StepObserver';

export type { NetworkError, ErrorLogSession } from './utils/ErrorLogger';
export type { StabilityOptions } from './utils/StabilityGuard';
export type { TestDataRecord } from './utils/TestDataManager';
export type { MockResponse, InterceptRule } from './utils/NetworkInterceptor';
export type { VisualCompareResult } from './utils/VisualRegression';
export type { A11yResult, A11yViolation } from './utils/AccessibilityChecker';
export type { TestRunReport } from './utils/TestReporter';
export type { DashboardEntry } from './utils/DashboardReporter';

// Config
export { DEFAULT_CONFIG } from './config';
export type { Config } from './config';

// Types
export type { Step, ActionType, StepResult } from './types';

// ── Unified namespace ────────────────────────────────────────────────────────
import { runStep, runStepDetailed } from './core/Runner';
import { runSteps, runStepsParallel } from './core/WorkflowRunner';
import { detectPattern, executePattern } from './engine/PatternEngine';
import { routeAction } from './engine/ActionRouter';
import { getLocatorStrategies } from './engine/LocatorEngine';
import { retryAction } from './engine/RetryEngine';
import { waitForElement, waitForPageStable } from './engine/SmartWait';
import { captureDOM } from './dom/DOMCapture';
import { getDOMDiff } from './dom/DOMDiff';
import { generateVisualDiff } from './dom/VisualDiff';
import { sanitizeDOM } from './dom/DOMSanitizer';
import { filterDOM } from './dom/SmartDOMFilter';
import { selfHeal } from './healing/SelfHeal';
import { updateFix, getAllFixes, clearFixes } from './learning/LearningStore';
import { getBestLocator } from './learning/FixApplier';
import { Logger } from './utils/Logger';
import { PageHelper } from './utils/PageHelper';
import { PageHelperGenerator } from './utils/PageHelperGenerator';
import { NetworkInterceptor } from './utils/NetworkInterceptor';
import { SessionManager } from './utils/SessionManager';
import { VisualRegression } from './utils/VisualRegression';
import { AccessibilityChecker } from './utils/AccessibilityChecker';
import { ShadowDOMHelper } from './utils/ShadowDOMHelper';
import { TestReporter } from './utils/TestReporter';
import { DashboardReporter } from './utils/DashboardReporter';
import { ErrorLogger } from './utils/ErrorLogger';
import { StabilityGuard } from './utils/StabilityGuard';
import { TestDataManager } from './utils/TestDataManager';
import { Env } from './utils/Env';
import { DEFAULT_CONFIG } from './config';
import { SecurityEnforcer } from './security/SecurityEnforcer';

export const Framework = {
  runStep,
  runStepDetailed,
  runSteps,
  runStepsParallel,
  detectPattern,
  executePattern,
  routeAction,
  getLocatorStrategies,
  retryAction,
  waitForElement,
  waitForPageStable,
  captureDOM,
  getDOMDiff,
  generateVisualDiff,
  sanitizeDOM,
  filterDOM,
  selfHeal,
  updateFix,
  getAllFixes,
  clearFixes,
  getBestLocator,
  Logger,
  PageHelper,
  PageHelperGenerator,
  NetworkInterceptor,
  SessionManager,
  VisualRegression,
  AccessibilityChecker,
  ShadowDOMHelper,
  TestReporter,
  DashboardReporter,
  ErrorLogger,
  StabilityGuard,
  TestDataManager,
  Env,
  SecurityEnforcer,
  DEFAULT_CONFIG,
};

export default Framework;
