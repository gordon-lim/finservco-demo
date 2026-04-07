import { generateId } from './utils';

// --- Event Types ---

export type ActorType = 'user' | 'system' | 'api';

export type AccountEventType =
  | 'ACCOUNT_CREATED'
  | 'ACCOUNT_UPDATED'
  | 'ACCOUNT_CLOSED'
  | 'BALANCE_CHANGED';

export type TransactionEventType =
  | 'TRANSACTION_INITIATED'
  | 'TRANSACTION_COMPLETED'
  | 'TRANSACTION_FAILED'
  | 'TRANSACTION_REVERSED';

export type RiskEventType =
  | 'RISK_ASSESSED'
  | 'RISK_REVIEW_REQUIRED'
  | 'RISK_OVERRIDE';

export type NotificationEventType =
  | 'NOTIFICATION_SENT'
  | 'NOTIFICATION_FAILED';

export type AuditEventType =
  | AccountEventType
  | TransactionEventType
  | RiskEventType
  | NotificationEventType;

export type AggregateType = 'Account' | 'Transaction' | 'RiskAssessment' | 'Notification';

export interface AuditEventMetadata {
  service: string;
  version: string;
  ip?: string;
}

export interface AuditEvent {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  aggregateType: AggregateType;
  aggregateId: string;
  actorId: string;
  actorType: ActorType;
  correlationId: string;
  payload: Record<string, unknown>;
  metadata: AuditEventMetadata;
}

// --- Event Query Types ---

export interface EventQuery {
  aggregateType?: AggregateType;
  aggregateId?: string;
  eventType?: AuditEventType;
  startTime?: Date;
  endTime?: Date;
  correlationId?: string;
  actorId?: string;
  limit?: number;
  offset?: number;
}

export interface EventQueryResult {
  events: AuditEvent[];
  total: number;
  limit: number;
  offset: number;
}

// --- Event Store Interface ---

export interface EventStore {
  append(event: Omit<AuditEvent, 'id' | 'timestamp'>): AuditEvent;
  query(query: EventQuery): EventQueryResult;
  getByAggregateId(aggregateType: AggregateType, aggregateId: string): AuditEvent[];
  getByCorrelationId(correlationId: string): AuditEvent[];
  getAll(): AuditEvent[];
  count(): number;
}

// --- In-Memory Event Store ---

export class InMemoryEventStore implements EventStore {
  private readonly events: AuditEvent[] = [];

  append(eventData: Omit<AuditEvent, 'id' | 'timestamp'>): AuditEvent {
    const event: AuditEvent = {
      ...eventData,
      id: generateId(),
      timestamp: new Date(),
    };

    // Append-only: push to the end, never modify or remove
    this.events.push(Object.freeze(event) as AuditEvent);
    return event;
  }

  query(query: EventQuery): EventQueryResult {
    let filtered = this.events.slice();

    if (query.aggregateType) {
      filtered = filtered.filter(e => e.aggregateType === query.aggregateType);
    }
    if (query.aggregateId) {
      filtered = filtered.filter(e => e.aggregateId === query.aggregateId);
    }
    if (query.eventType) {
      filtered = filtered.filter(e => e.eventType === query.eventType);
    }
    if (query.correlationId) {
      filtered = filtered.filter(e => e.correlationId === query.correlationId);
    }
    if (query.actorId) {
      filtered = filtered.filter(e => e.actorId === query.actorId);
    }
    if (query.startTime) {
      const start = query.startTime.getTime();
      filtered = filtered.filter(e => e.timestamp.getTime() >= start);
    }
    if (query.endTime) {
      const end = query.endTime.getTime();
      filtered = filtered.filter(e => e.timestamp.getTime() <= end);
    }

    const total = filtered.length;
    const offset = query.offset || 0;
    const limit = query.limit || 50;
    const paged = filtered.slice(offset, offset + limit);

    return { events: paged, total, limit, offset };
  }

  getByAggregateId(aggregateType: AggregateType, aggregateId: string): AuditEvent[] {
    return this.events.filter(
      e => e.aggregateType === aggregateType && e.aggregateId === aggregateId
    );
  }

  getByCorrelationId(correlationId: string): AuditEvent[] {
    return this.events.filter(e => e.correlationId === correlationId);
  }

  getAll(): AuditEvent[] {
    return this.events.slice();
  }

  count(): number {
    return this.events.length;
  }
}

// --- Singleton Event Store ---

let globalEventStore: EventStore = new InMemoryEventStore();

export function getEventStore(): EventStore {
  return globalEventStore;
}

export function setEventStore(store: EventStore): void {
  globalEventStore = store;
}

// --- Helper to create correlation IDs ---

export function createCorrelationId(): string {
  return generateId();
}

// --- Helper to build audit events ---

export function emitAuditEvent(params: {
  eventType: AuditEventType;
  aggregateType: AggregateType;
  aggregateId: string;
  actorId: string;
  actorType: ActorType;
  correlationId: string;
  payload: Record<string, unknown>;
  service: string;
  version?: string;
  ip?: string;
}): AuditEvent {
  const store = getEventStore();
  return store.append({
    eventType: params.eventType,
    aggregateType: params.aggregateType,
    aggregateId: params.aggregateId,
    actorId: params.actorId,
    actorType: params.actorType,
    correlationId: params.correlationId,
    payload: params.payload,
    metadata: {
      service: params.service,
      version: params.version || '1.0.0',
      ip: params.ip,
    },
  });
}
