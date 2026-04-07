import { Router, Request, Response } from 'express';
import { sendEmail } from './email';
import { sendSms } from './sms';
import type { NotificationChannel } from '../../../../packages/common/src/types';
import { createLogger } from '../../../../packages/logger/src';
import { generateId, getCurrentTimestamp } from '../../../../packages/common/src/utils';

const logger = createLogger('notification-router');

export const notificationRouter = Router();

interface NotificationRequest {
  accountId: string;
  channel: NotificationChannel;
  subject: string;
  body: string;
  recipientEmail?: string;
  recipientPhone?: string;
}

// In-memory notification log
const notificationLog: Array<{
  id: string;
  accountId: string;
  channel: NotificationChannel;
  subject: string;
  body: string;
  status: 'sent' | 'failed' | 'pending';
  sentAt: Date | null;
  error?: string;
}> = [];

// POST /api/notifications/send - Send a notification
notificationRouter.post('/send', async (req: Request, res: Response) => {
  const { accountId, channel, subject, body, recipientEmail, recipientPhone }: NotificationRequest = req.body;

  if (!accountId || !channel || !subject || !body) {
    res.status(400).json({ error: 'Missing required fields: accountId, channel, subject, body' });
    return;
  }

  const notificationId = generateId();
  const logEntry = {
    id: notificationId,
    accountId,
    channel,
    subject,
    body,
    status: 'pending' as const,
    sentAt: null as Date | null,
  };

  notificationLog.push(logEntry);

  try {
    switch (channel) {
      case 'email':
        if (!recipientEmail) {
          res.status(400).json({ error: 'recipientEmail is required for email notifications' });
          return;
        }
        // BUG (Issue #14): Email body not escaped - XSS vulnerability
        await sendEmail(recipientEmail, subject, body);
        break;

      case 'sms':
        if (!recipientPhone) {
          res.status(400).json({ error: 'recipientPhone is required for SMS notifications' });
          return;
        }
        await sendSms(recipientPhone, body);
        break;

      case 'push':
        // MISSING FEATURE: Push notifications not implemented
        logger.warn('Push notifications not yet implemented');
        res.status(501).json({ error: 'Push notifications not yet implemented' });
        return;

      default:
        res.status(400).json({ error: `Unsupported notification channel: ${channel}` });
        return;
    }

    logEntry.status = 'sent';
    logEntry.sentAt = getCurrentTimestamp();

    logger.info('Notification sent', { notificationId, channel, accountId });
    res.status(201).json({ id: notificationId, status: 'sent' });
  } catch (error) {
    logEntry.status = 'failed';
    logger.error('Failed to send notification', {
      notificationId,
      channel,
      error: (error as Error).message,
    });

    res.status(500).json({
      id: notificationId,
      status: 'failed',
      error: (error as Error).message,
    });
  }
});

// GET /api/notifications - List notification history
notificationRouter.get('/', (_req: Request, res: Response) => {
  res.json({ data: notificationLog, total: notificationLog.length });
});

// GET /api/notifications/:id - Get notification by ID
notificationRouter.get('/:id', (req: Request, res: Response) => {
  const notification = notificationLog.find((n) => n.id === req.params.id);
  if (!notification) {
    res.status(404).json({ error: `Notification ${req.params.id} not found` });
    return;
  }
  res.json(notification);
});
