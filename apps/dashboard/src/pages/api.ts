import { Router, Request, Response } from 'express';
import { createLogger } from '../../../../packages/logger/src';

const logger = createLogger('dashboard-api');

export const apiRouter = Router();

// Dashboard aggregation endpoints
// These would normally call the other services

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latency: number;
  lastChecked: string;
}

// GET /api/dashboard/health - Aggregate health of all services
apiRouter.get('/health', async (_req: Request, res: Response) => {
  // In a real system, this would actually ping each service
  const services: ServiceHealth[] = [
    {
      name: 'account-service',
      status: 'healthy',
      latency: 45,
      lastChecked: new Date().toISOString(),
    },
    {
      name: 'transaction-service',
      status: 'healthy',
      latency: 62,
      lastChecked: new Date().toISOString(),
    },
    {
      name: 'risk-engine',
      status: 'healthy',
      latency: 120,
      lastChecked: new Date().toISOString(),
    },
    {
      name: 'notification-service',
      status: 'degraded',
      latency: 890,
      lastChecked: new Date().toISOString(),
    },
  ];

  const allHealthy = services.every((s) => s.status === 'healthy');

  res.json({
    overall: allHealthy ? 'healthy' : 'degraded',
    services,
  });
});

// GET /api/dashboard/stats - Dashboard statistics
apiRouter.get('/stats', (_req: Request, res: Response) => {
  // Mock statistics - in production would aggregate from services
  res.json({
    accounts: {
      total: 4283,
      active: 3891,
      suspended: 142,
      closed: 250,
    },
    transactions: {
      today: 1247,
      volume: 2_400_000,
      avgAmount: 1924.62,
      failureRate: 0.023,
    },
    risk: {
      highRiskCount: 17,
      reviewPending: 8,
      autoApproved: 1222,
    },
    notifications: {
      sent: 3456,
      failed: 23,
      pending: 12,
    },
  });
});

// GET /api/dashboard/recent-activity - Recent activity feed
apiRouter.get('/recent-activity', (_req: Request, res: Response) => {
  const activities = [
    { type: 'transaction', message: 'Wire transfer of $45,000 flagged for review', timestamp: new Date().toISOString(), severity: 'high' },
    { type: 'account', message: 'New business account opened: Acme Corp', timestamp: new Date().toISOString(), severity: 'info' },
    { type: 'risk', message: 'Unusual login pattern detected for account #4521', timestamp: new Date().toISOString(), severity: 'medium' },
    { type: 'notification', message: 'SMS delivery failure rate above threshold', timestamp: new Date().toISOString(), severity: 'warning' },
    { type: 'transaction', message: 'Batch of 200 ACH transfers completed', timestamp: new Date().toISOString(), severity: 'info' },
  ];

  res.json({ data: activities });
});
