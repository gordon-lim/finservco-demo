import { createLogger } from '../../../../packages/logger/src';
import { NOTIFICATION_RETRY_ATTEMPTS, NOTIFICATION_RETRY_DELAY_MS } from '../../../../packages/common/src/constants';

const logger = createLogger('slack-channel');

export async function sendSlackMessage(
  webhookUrl: string,
  subject: string,
  body: string,
  retryCount = 0
): Promise<void> {
  try {
    if (!webhookUrl.startsWith('https://hooks.slack.com/')) {
      throw new Error('Invalid Slack webhook URL');
    }

    const payload = {
      text: `*${subject}*\n${body}`,
    };

    logger.info('Sending Slack message', { subject });

    // Simulated Slack webhook call - in production this would POST to the webhook URL
    // const response = await fetch(webhookUrl, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(payload),
    // });

    // Simulate occasional failures
    if (Math.random() < 0.05 && retryCount < NOTIFICATION_RETRY_ATTEMPTS) {
      throw new Error('Slack webhook request timeout');
    }

    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 150));

    logger.info('Slack message sent successfully', { subject });
  } catch (error) {
    if (retryCount < NOTIFICATION_RETRY_ATTEMPTS) {
      logger.warn(`Slack send failed, retrying (${retryCount + 1}/${NOTIFICATION_RETRY_ATTEMPTS})`, {
        error: (error as Error).message,
      });

      await new Promise((resolve) => setTimeout(resolve, NOTIFICATION_RETRY_DELAY_MS));
      return sendSlackMessage(webhookUrl, subject, body, retryCount + 1);
    }

    logger.error('Slack send failed after all retries', {
      subject,
      attempts: NOTIFICATION_RETRY_ATTEMPTS,
    });
    throw error;
  }
}
