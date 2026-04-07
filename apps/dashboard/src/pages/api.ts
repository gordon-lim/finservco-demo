import { Router, Request, Response } from 'express';
import { createLogger } from '../../../../packages/logger/src';
import { getEventStore } from '../../../../packages/common/src/audit';
import type { AggregateType, AuditEventType } from '../../../../packages/common/src/audit';

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

// GET /api/dashboard/audit-log - Query audit events
apiRouter.get('/audit-log', (req: Request, res: Response) => {
  const store = getEventStore();

  const query: {
    aggregateType?: AggregateType;
    aggregateId?: string;
    eventType?: AuditEventType;
    correlationId?: string;
    actorId?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
    offset?: number;
  } = {};

  if (req.query.aggregateType) {
    query.aggregateType = req.query.aggregateType as AggregateType;
  }
  if (req.query.aggregateId) {
    query.aggregateId = req.query.aggregateId as string;
  }
  if (req.query.eventType) {
    query.eventType = req.query.eventType as AuditEventType;
  }
  if (req.query.correlationId) {
    query.correlationId = req.query.correlationId as string;
  }
  if (req.query.actorId) {
    query.actorId = req.query.actorId as string;
  }
  if (req.query.startTime) {
    const d = new Date(req.query.startTime as string);
    if (isNaN(d.getTime())) {
      res.status(400).json({ error: 'Invalid startTime format' });
      return;
    }
    query.startTime = d;
  }
  if (req.query.endTime) {
    const d = new Date(req.query.endTime as string);
    if (isNaN(d.getTime())) {
      res.status(400).json({ error: 'Invalid endTime format' });
      return;
    }
    query.endTime = d;
  }
  if (req.query.limit) {
    const parsed = parseInt(req.query.limit as string, 10);
    if (!isNaN(parsed) && parsed > 0) {
      query.limit = parsed;
    }
  }
  if (req.query.offset) {
    const parsed = parseInt(req.query.offset as string, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      query.offset = parsed;
    }
  }

  const result = store.query(query);
  res.json(result);
});

// GET /api/dashboard/audit-log/aggregate/:type/:id - Get events for a specific aggregate
apiRouter.get('/audit-log/aggregate/:type/:id', (req: Request, res: Response) => {
  const store = getEventStore();
  const events = store.getByAggregateId(
    req.params.type as AggregateType,
    req.params.id
  );
  res.json({ events, total: events.length });
});

// GET /api/dashboard/audit-log/correlation/:id - Get events by correlation ID
apiRouter.get('/audit-log/correlation/:id', (req: Request, res: Response) => {
  const store = getEventStore();
  const events = store.getByCorrelationId(req.params.id);
  res.json({ events, total: events.length });
});
