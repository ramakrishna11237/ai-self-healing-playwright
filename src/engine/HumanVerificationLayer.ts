import { Logger } from '../utils/Logger';
import { Step } from '../types';

export interface VerificationRequest {
  id: string;
  step: Step;
  candidates: string[];
  timestamp: number;
  status: 'pending' | 'approved' | 'rejected' | 'timeout';
  selectedCandidate?: string;
  reason?: string;
}

export class HumanVerificationLayer {
  private static pendingVerifications = new Map<string, VerificationRequest>();
  private static verificationTimeoutMs = 30000; // 30 seconds
  private static isEnabled = process.env.FW_HUMAN_VERIFICATION === 'true';

  static async requireVerification(
    step: Step,
    candidates: string[],
    context: Record<string, unknown> = {}
  ): Promise<{ approved: boolean; selectedCandidate?: string; reason?: string }> {
    if (!this.isEnabled || this.isTrustedEnvironment()) {
      return { approved: true, selectedCandidate: candidates[0] };
    }

    const requestId = this.createVerificationRequest(step, candidates, context);
    Logger.info(`Human verification required for: ${step.label}`, { requestId });

    try {
      const result = await this.waitForVerification(requestId);
      return result;
    } catch (error) {
      Logger.warn(`Human verification timeout for: ${step.label}`);
      return { approved: false, reason: 'timeout' };
    }
  }

  private static createVerificationRequest(
    step: Step,
    candidates: string[],
    context: Record<string, unknown>
  ): string {
    const requestId = `verify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const request: VerificationRequest = {
      id: requestId,
      step,
      candidates,
      timestamp: Date.now(),
      status: 'pending',
    };

    this.pendingVerifications.set(requestId, request);
    this.notifyVerificationTeam(request, context);

    // Auto-reject after timeout
    setTimeout(() => {
      const currentRequest = this.pendingVerifications.get(requestId);
      if (currentRequest && currentRequest.status === 'pending') {
        currentRequest.status = 'timeout';
        this.pendingVerifications.set(requestId, currentRequest);
      }
    }, this.verificationTimeoutMs);

    return requestId;
  }

  private static async waitForVerification(
    requestId: string
  ): Promise<{ approved: boolean; selectedCandidate?: string; reason?: string }> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.verificationTimeoutMs) {
      const request = this.pendingVerifications.get(requestId);

      if (request && request.status !== 'pending') {
        this.pendingVerifications.delete(requestId);

        return {
          approved: request.status === 'approved',
          selectedCandidate: request.selectedCandidate,
          reason: request.reason,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 100)); // Poll every 100ms
    }

    throw new Error('Verification timeout');
  }

  private static notifyVerificationTeam(
    request: VerificationRequest,
    context: Record<string, unknown>
  ): void {
    // Implement your notification system here:
    // - Slack/Teams webhook
    // - Email notification
    // - Dashboard update
    // - SMS alert

    const message = {
      type: 'healing_verification',
      requestId: request.id,
      step: request.step,
      candidates: request.candidates,
      timestamp: new Date().toISOString(),
      context: context,
    };

    Logger.info('Verification required - implement your notification system', message);
  }

  private static isTrustedEnvironment(): boolean {
    // Trusted environments skip human verification:
    // - CI/CD pipelines with approved tests
    // - Local development
    // - Pre-production environments

    return (
      process.env.NODE_ENV === 'development' ||
      process.env.CI === 'true' ||
      process.env.FW_TRUSTED_MODE === 'true'
    );
  }

  // API for external verification systems
  static approveVerification(
    requestId: string,
    selectedCandidate: string,
    reason?: string
  ): boolean {
    const request = this.pendingVerifications.get(requestId);
    if (request && request.status === 'pending') {
      request.status = 'approved';
      request.selectedCandidate = selectedCandidate;
      request.reason = reason;
      this.pendingVerifications.set(requestId, request);
      return true;
    }
    return false;
  }

  static rejectVerification(requestId: string, reason: string): boolean {
    const request = this.pendingVerifications.get(requestId);
    if (request && request.status === 'pending') {
      request.status = 'rejected';
      request.reason = reason;
      this.pendingVerifications.set(requestId, request);
      return true;
    }
    return false;
  }

  static getPendingVerifications(): VerificationRequest[] {
    return Array.from(this.pendingVerifications.values()).filter((req) => req.status === 'pending');
  }
}
