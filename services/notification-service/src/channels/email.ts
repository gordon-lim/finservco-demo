import { createLogger } from '../../../../packages/logger/src';
import { NOTIFICATION_RETRY_ATTEMPTS, NOTIFICATION_RETRY_DELAY_MS } from '../../../../packages/common/src/constants';
import { escapeHtml } from '../../../../packages/common/src/utils';

const logger = createLogger('email-channel');

function buildEmailHtml(subject: string, body: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; }
        .header { background-color: #1a365d; color: white; padding: 20px; }
        .content { padding: 20px; background-color: #f7fafc; }
        .footer { padding: 10px; font-size: 12px; color: #718096; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>FinServCo</h1>
          <h2>${escapeHtml(subject)}</h2>
        </div>
        <div class="content">
          <p>${body}</p>
        </div>
        <div class="footer">
          <p>This is an automated notification from FinServCo. Do not reply to this email.</p>
          <p>&copy; 2024 FinServCo Financial Services. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  retryCount = 0
): Promise<void> {
  const html = buildEmailHtml(subject, body);

  try {
    // Simulated email sending - in production this would use SMTP/SES/SendGrid
    logger.info('Sending email', { to, subject });

    // Simulate occasional failures for retry testing
    if (Math.random() < 0.1 && retryCount < NOTIFICATION_RETRY_ATTEMPTS) {
      throw new Error('SMTP connection timeout');
    }

    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 100));

    logger.info('Email sent successfully', { to, subject });
  } catch (error) {
    if (retryCount < NOTIFICATION_RETRY_ATTEMPTS) {
      logger.warn(`Email send failed, retrying (${retryCount + 1}/${NOTIFICATION_RETRY_ATTEMPTS})`, {
        to,
        error: (error as Error).message,
      });

      await new Promise((resolve) => setTimeout(resolve, NOTIFICATION_RETRY_DELAY_MS));
      return sendEmail(to, subject, body, retryCount + 1);
    }

    logger.error('Email send failed after all retries', {
      to,
      subject,
      attempts: NOTIFICATION_RETRY_ATTEMPTS,
    });
    throw error;
  }
}
