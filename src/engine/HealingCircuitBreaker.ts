import { Logger } from '../utils/Logger';

export class HealingCircuitBreaker {
  private static failureCount = 0;
  private static lastFailureTime = 0;
  private static cooldownEndTime = 0;
  private static readonly MAX_FAILURES = 5; // 5 consecutive failures before cooldown
  private static readonly COOLDOWN_PERIOD = 60000; // 1 minute cooldown (was 10 min)
  private static readonly GLOBAL_COOLDOWN = 300000; // 5 minute global cooldown (was 30 min)

  static canAttemptHeal(): boolean {
    if (this.isInGlobalCooldown()) {
      Logger.warn('Healing circuit breaker: Global cooldown active');
      return false;
    }

    if (this.failureCount >= this.MAX_FAILURES) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure < this.COOLDOWN_PERIOD) {
        Logger.warn(
          `Healing circuit breaker: Local cooldown active (${Math.ceil((this.COOLDOWN_PERIOD - timeSinceLastFailure) / 1000)}s remaining)`
        );
        return false;
      }
      this.reset();
    }

    return true;
  }

  static recordFailure(severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    // Adjust failure impact based on severity
    const severityMultiplier = {
      low: 0.5,
      medium: 1,
      high: 1.5,
      critical: 2,
    }[severity];

    this.failureCount = Math.min(this.MAX_FAILURES, Math.round(this.failureCount * severityMultiplier));

    Logger.warn(
      `Healing failure recorded (severity: ${severity}, count: ${this.failureCount}/${this.MAX_FAILURES})`
    );

    if (this.failureCount >= this.MAX_FAILURES) {
      this.triggerCooldown();
    }

    if (severity === 'critical') {
      this.triggerGlobalCooldown();
    }
  }

  static recordSuccess(): void {
    // Gradually reduce failure count on success
    if (this.failureCount > 0) {
      this.failureCount = Math.max(0, this.failureCount - 1);
      Logger.debug(
        `Healing success recorded (count: ${this.failureCount}/${this.MAX_FAILURES})`
      );
    }
  }

  private static triggerCooldown(): void {
    this.cooldownEndTime = Date.now() + this.COOLDOWN_PERIOD;
    Logger.warn(`Healing cooldown triggered for ${this.COOLDOWN_PERIOD / 1000}s`);
  }

  private static triggerGlobalCooldown(): void {
    this.cooldownEndTime = Date.now() + this.GLOBAL_COOLDOWN;
    Logger.error(
      `GLOBAL HEALING COOLDOWN triggered for ${this.GLOBAL_COOLDOWN / 1000}s - critical failure detected`
    );

    // Notify monitoring systems
    this.notifyGlobalCooldown();
  }

  private static isInGlobalCooldown(): boolean {
    return Date.now() < this.cooldownEndTime;
  }

  static reset(): void {
    this.failureCount = 0;
    this.cooldownEndTime = 0;
    Logger.info('Healing circuit breaker reset');
  }

  static getStatus(): {
    enabled: boolean;
    failureCount: number;
    maxFailures: number;
    cooldownActive: boolean;
    cooldownRemaining: number;
    globalCooldown: boolean;
  } {
    const now = Date.now();
    const cooldownActive = now < this.cooldownEndTime;
    const cooldownRemaining = cooldownActive ? this.cooldownEndTime - now : 0;
    const globalCooldown = cooldownRemaining > this.COOLDOWN_PERIOD;

    return {
      enabled: true,
      failureCount: this.failureCount,
      maxFailures: this.MAX_FAILURES,
      cooldownActive,
      cooldownRemaining,
      globalCooldown,
    };
  }

  private static notifyGlobalCooldown(): void {
    const message: Record<string, unknown> = {
      type: 'healing_global_cooldown',
      timestamp: new Date().toISOString(),
      duration: this.GLOBAL_COOLDOWN,
      failureCount: this.failureCount,
      lastFailureTime: new Date(this.lastFailureTime).toISOString(),
    };
    Logger.error('GLOBAL HEALING COOLDOWN ACTIVATED', message);
  }

  // Emergency override for critical systems
  static emergencyOverride(): boolean {
    if (this.isInGlobalCooldown()) {
      Logger.error('EMERGENCY HEALING OVERRIDE ACTIVATED - USE WITH EXTREME CAUTION');
      this.reset();
      return true;
    }
    return false;
  }

  // Diagnostic information
  static getDiagnostics(): Record<string, unknown> {
    return {
      ...this.getStatus(),
      lastFailureTime: new Date(this.lastFailureTime).toISOString(),
      cooldownEndTime: new Date(this.cooldownEndTime).toISOString(),
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
    };
  }
}
