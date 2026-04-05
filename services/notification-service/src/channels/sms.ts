import { createLogger } from '../../../../packages/logger/src';
import { NOTIFICATION_RETRY_ATTEMPTS, NOTIFICATION_RETRY_DELAY_MS } from '../../../../packages/common/src/constants';

const logger = createLogger('sms-channel');

const MAX_SMS_LENGTH = 160;

export async function sendSms(
  to: string,
  message: string,
  retryCount = 0
): Promise<void> {
  try {
    // Validate phone number format (basic check)
    if (!/^\+?[\d\s\-()]+$/.test(to)) {
      throw new Error(`Invalid phone number format: ${to}`);
    }

    // Truncate message if too long
    const truncatedMessage = message.length > MAX_SMS_LENGTH
      ? message.substring(0, MAX_SMS_LENGTH - 3) + '...'
      : message;

    // Simulated SMS sending
    logger.info('Sending SMS', { to, messageLength: truncatedMessage.length });

    // Simulate occasional failures
    if (Math.random() < 0.05) {
      throw new Error('SMS gateway timeout');
    }

    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 200));

    logger.info('SMS sent successfully', { to });
  } catch (error) {
    if (retryCount < NOTIFICATION_RETRY_ATTEMPTS) {
      logger.warn(`SMS send failed, retrying (${retryCount + 1}/${NOTIFICATION_RETRY_ATTEMPTS})`, {
        to,
        error: (error as Error).message,
      });

      await new Promise((resolve) => setTimeout(resolve, NOTIFICATION_RETRY_DELAY_MS));
      return sendSms(to, message, retryCount + 1);
    }

    logger.error('SMS send failed after all retries', { to });
    throw error;
  }
}
