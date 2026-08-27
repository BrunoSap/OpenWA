import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLogger } from '../../../common/services/logger.service';
import { AnalyticsAlertRule } from '../entities/analytics-alert-rule.entity';
import { postWebhookPayload } from '../../webhook/utils/deliver-once';

/**
 * Phase 6 Plan 03 Task 2: Alert dispatch service (DASH-02, T-06-09).
 *
 * Routes alert notifications to configured channels (slack/webhook/email). Reuses the
 * existing SSRF guard pattern (postWebhookPayload from Phase 1) for webhook targets.
 *
 * Email channel emits a structured log warning if no mailer service is discovered
 * (avoids adding nodemailer dependency unless project already has it).
 */
@Injectable()
export class AlertDispatchService {
  private readonly logger = createLogger('AlertDispatchService');
  private readonly slackWebhookUrl: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.slackWebhookUrl = this.configService.get<string>('SLACK_WEBHOOK_URL');
  }

  /**
   * Dispatches alert notification to configured channels.
   *
   * @param rule - Alert rule that breached
   * @param currentValue - Current metric value
   */
  async dispatch(rule: AnalyticsAlertRule, currentValue: number): Promise<void> {
    const channels = rule.notification_channels || {};

    if (Object.keys(channels).length === 0) {
      this.logger.debug(`Rule ${rule.id} has no notification channels configured`);
      return;
    }

    const message = this.buildAlertMessage(rule, currentValue);

    // Dispatch to each enabled channel
    if (channels.slack && this.slackWebhookUrl) {
      await this.dispatchToSlack(message);
    }

    if (channels.webhook && channels.webhook_url) {
      await this.dispatchToWebhook(channels.webhook_url, rule, currentValue);
    }

    if (channels.email) {
      this.dispatchToEmail(message);
    }
  }

  /**
   * Builds alert message text.
   *
   * @param rule - Alert rule
   * @param currentValue - Current value
   * @returns Message text
   */
  private buildAlertMessage(rule: AnalyticsAlertRule, currentValue: number): string {
    return `🚨 Alert: ${rule.name}\nMetric: ${rule.metric}\nCondition: ${rule.condition} ${rule.threshold}\nCurrent Value: ${currentValue}`;
  }

  /**
   * Dispatches to Slack webhook.
   *
   * @param message - Message text
   */
  private async dispatchToSlack(message: string): Promise<void> {
    if (!this.slackWebhookUrl) {
      this.logger.warn('Slack webhook URL not configured (SLACK_WEBHOOK_URL env var missing)');
      return;
    }

    try {
      const payload = JSON.stringify({ text: message });
      const timeout = this.configService.get<number>('webhook.timeout', 10000);
      await postWebhookPayload(this.slackWebhookUrl, payload, { 'Content-Type': 'application/json' }, timeout);
      this.logger.log('Alert dispatched to Slack');
    } catch (error) {
      this.logger.error(`Failed to dispatch to Slack: ${error}`);
    }
  }

  /**
   * Dispatches to webhook (with SSRF guard via postWebhookPayload).
   *
   * @param webhookUrl - Target webhook URL
   * @param rule - Alert rule
   * @param currentValue - Current value
   */
  private async dispatchToWebhook(
    webhookUrl: string,
    rule: AnalyticsAlertRule,
    currentValue: number,
  ): Promise<void> {
    try {
      const payload = JSON.stringify({
        alert_name: rule.name,
        metric: rule.metric,
        condition: rule.condition,
        threshold: rule.threshold,
        current_value: currentValue,
        timestamp: new Date().toISOString(),
      });
      const timeout = this.configService.get<number>('webhook.timeout', 10000);
      // T-06-09: postWebhookPayload includes SSRF guard (validates URL scheme, checks allowlist)
      await postWebhookPayload(webhookUrl, payload, { 'Content-Type': 'application/json' }, timeout);
      this.logger.log(`Alert dispatched to webhook: ${webhookUrl}`);
    } catch (error) {
      this.logger.error(`Failed to dispatch to webhook: ${error}`);
    }
  }

  /**
   * Dispatches to email (logs warning if no mailer configured).
   *
   * @param message - Message text
   */
  private dispatchToEmail(message: string): void {
    // Email dispatch requires a mailer service (nodemailer, @nestjs-modules/mailer, etc).
    // Since the project may not have one installed, emit a structured log warning instead
    // of throwing an error or adding a new dependency.
    this.logger.warn(
      `Email alert dispatch requested but no mailer service is configured. Message: ${message}`,
    );
  }
}
