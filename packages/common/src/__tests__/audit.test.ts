import {
  InMemoryEventStore,
  emitAuditEvent,
  getEventStore,
  setEventStore,
  createCorrelationId,
} from '../audit';

describe('InMemoryEventStore', () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
  });

  describe('append', () => {
    it('should append an event and return it with id and timestamp', () => {
      const event = store.append({
        eventType: 'ACCOUNT_CREATED',
        aggregateType: 'Account',
        aggregateId: 'acc-001',
        actorId: 'user-001',
        actorType: 'user',
        correlationId: 'corr-001',
        payload: { holderName: 'John Smith' },
        metadata: { service: 'account-service', version: '1.0.0' },
      });

      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.eventType).toBe('ACCOUNT_CREATED');
      expect(event.aggregateType).toBe('Account');
      expect(event.aggregateId).toBe('acc-001');
      expect(event.actorId).toBe('user-001');
      expect(event.actorType).toBe('user');
      expect(event.correlationId).toBe('corr-001');
      expect(event.payload).toEqual({ holderName: 'John Smith' });
      expect(event.metadata.service).toBe('account-service');
    });

    it('should create immutable events (frozen objects)', () => {
      const event = store.append({
        eventType: 'ACCOUNT_CREATED',
        aggregateType: 'Account',
        aggregateId: 'acc-001',
        actorId: 'system',
        actorType: 'system',
        correlationId: 'corr-001',
        payload: {},
        metadata: { service: 'test', version: '1.0.0' },
      });

      expect(Object.isFrozen(event)).toBe(true);
    });

    it('should maintain append-only ordering', () => {
      store.append({
        eventType: 'ACCOUNT_CREATED',
        aggregateType: 'Account',
        aggregateId: 'acc-001',
        actorId: 'system',
        actorType: 'system',
        correlationId: 'corr-001',
        payload: {},
        metadata: { service: 'test', version: '1.0.0' },
      });

      store.append({
        eventType: 'ACCOUNT_UPDATED',
        aggregateType: 'Account',
        aggregateId: 'acc-001',
        actorId: 'system',
        actorType: 'system',
        correlationId: 'corr-002',
        payload: {},
        metadata: { service: 'test', version: '1.0.0' },
      });

      const events = store.getAll();
      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe('ACCOUNT_CREATED');
      expect(events[1].eventType).toBe('ACCOUNT_UPDATED');
    });
  });

  describe('query', () => {
    beforeEach(() => {
      // Seed events for querying
      store.append({
        eventType: 'ACCOUNT_CREATED',
        aggregateType: 'Account',
        aggregateId: 'acc-001',
        actorId: 'user-001',
        actorType: 'user',
        correlationId: 'corr-001',
        payload: {},
        metadata: { service: 'account-service', version: '1.0.0' },
      });

      store.append({
        eventType: 'TRANSACTION_INITIATED',
        aggregateType: 'Transaction',
        aggregateId: 'tx-001',
        actorId: 'user-001',
        actorType: 'user',
        correlationId: 'corr-002',
        payload: {},
        metadata: { service: 'transaction-service', version: '1.0.0' },
      });

      store.append({
        eventType: 'TRANSACTION_COMPLETED',
        aggregateType: 'Transaction',
        aggregateId: 'tx-001',
        actorId: 'system',
        actorType: 'system',
        correlationId: 'corr-002',
        payload: {},
        metadata: { service: 'transaction-service', version: '1.0.0' },
      });

      store.append({
        eventType: 'RISK_ASSESSED',
        aggregateType: 'RiskAssessment',
        aggregateId: 'tx-001',
        actorId: 'system',
        actorType: 'system',
        correlationId: 'corr-002',
        payload: {},
        metadata: { service: 'risk-engine', version: '1.0.0' },
      });
    });

    it('should return all events when no filters are provided', () => {
      const result = store.query({});
      expect(result.total).toBe(4);
      expect(result.events).toHaveLength(4);
    });

    it('should filter by aggregateType', () => {
      const result = store.query({ aggregateType: 'Transaction' });
      expect(result.total).toBe(2);
      expect(result.events.every(e => e.aggregateType === 'Transaction')).toBe(true);
    });

    it('should filter by aggregateId', () => {
      const result = store.query({ aggregateId: 'acc-001' });
      expect(result.total).toBe(1);
      expect(result.events[0].aggregateId).toBe('acc-001');
    });

    it('should filter by eventType', () => {
      const result = store.query({ eventType: 'TRANSACTION_COMPLETED' });
      expect(result.total).toBe(1);
      expect(result.events[0].eventType).toBe('TRANSACTION_COMPLETED');
    });

    it('should filter by correlationId', () => {
      const result = store.query({ correlationId: 'corr-002' });
      expect(result.total).toBe(3);
      expect(result.events.every(e => e.correlationId === 'corr-002')).toBe(true);
    });

    it('should filter by actorId', () => {
      const result = store.query({ actorId: 'user-001' });
      expect(result.total).toBe(2);
      expect(result.events.every(e => e.actorId === 'user-001')).toBe(true);
    });

    it('should support pagination with limit and offset', () => {
      const result = store.query({ limit: 2, offset: 1 });
      expect(result.total).toBe(4);
      expect(result.events).toHaveLength(2);
      expect(result.limit).toBe(2);
      expect(result.offset).toBe(1);
    });

    it('should support temporal queries with startTime and endTime', () => {
      const now = new Date();
      const result = store.query({
        startTime: new Date(now.getTime() - 60000),
        endTime: new Date(now.getTime() + 60000),
      });
      expect(result.total).toBe(4);
    });
  });

  describe('getByAggregateId', () => {
    it('should return events for a specific aggregate', () => {
      store.append({
        eventType: 'ACCOUNT_CREATED',
        aggregateType: 'Account',
        aggregateId: 'acc-001',
        actorId: 'system',
        actorType: 'system',
        correlationId: 'corr-001',
        payload: {},
        metadata: { service: 'test', version: '1.0.0' },
      });

      store.append({
        eventType: 'ACCOUNT_UPDATED',
        aggregateType: 'Account',
        aggregateId: 'acc-001',
        actorId: 'system',
        actorType: 'system',
        correlationId: 'corr-002',
        payload: {},
        metadata: { service: 'test', version: '1.0.0' },
      });

      store.append({
        eventType: 'ACCOUNT_CREATED',
        aggregateType: 'Account',
        aggregateId: 'acc-002',
        actorId: 'system',
        actorType: 'system',
        correlationId: 'corr-003',
        payload: {},
        metadata: { service: 'test', version: '1.0.0' },
      });

      const events = store.getByAggregateId('Account', 'acc-001');
      expect(events).toHaveLength(2);
      expect(events.every(e => e.aggregateId === 'acc-001')).toBe(true);
    });
  });

  describe('getByCorrelationId', () => {
    it('should return all events linked by correlation ID', () => {
      store.append({
        eventType: 'TRANSACTION_INITIATED',
        aggregateType: 'Transaction',
        aggregateId: 'tx-001',
        actorId: 'system',
        actorType: 'system',
        correlationId: 'corr-transfer-001',
        payload: {},
        metadata: { service: 'transaction-service', version: '1.0.0' },
      });

      store.append({
        eventType: 'RISK_ASSESSED',
        aggregateType: 'RiskAssessment',
        aggregateId: 'tx-001',
        actorId: 'system',
        actorType: 'system',
        correlationId: 'corr-transfer-001',
        payload: {},
        metadata: { service: 'risk-engine', version: '1.0.0' },
      });

      store.append({
        eventType: 'TRANSACTION_COMPLETED',
        aggregateType: 'Transaction',
        aggregateId: 'tx-001',
        actorId: 'system',
        actorType: 'system',
        correlationId: 'corr-transfer-001',
        payload: {},
        metadata: { service: 'transaction-service', version: '1.0.0' },
      });

      const events = store.getByCorrelationId('corr-transfer-001');
      expect(events).toHaveLength(3);
      expect(events[0].eventType).toBe('TRANSACTION_INITIATED');
      expect(events[1].eventType).toBe('RISK_ASSESSED');
      expect(events[2].eventType).toBe('TRANSACTION_COMPLETED');
    });
  });

  describe('count', () => {
    it('should return the total number of events', () => {
      expect(store.count()).toBe(0);

      store.append({
        eventType: 'ACCOUNT_CREATED',
        aggregateType: 'Account',
        aggregateId: 'acc-001',
        actorId: 'system',
        actorType: 'system',
        correlationId: 'corr-001',
        payload: {},
        metadata: { service: 'test', version: '1.0.0' },
      });

      expect(store.count()).toBe(1);
    });
  });
});

describe('emitAuditEvent', () => {
  beforeEach(() => {
    setEventStore(new InMemoryEventStore());
  });

  it('should emit an event to the global store', () => {
    const event = emitAuditEvent({
      eventType: 'ACCOUNT_CREATED',
      aggregateType: 'Account',
      aggregateId: 'acc-001',
      actorId: 'user-001',
      actorType: 'user',
      correlationId: 'corr-001',
      payload: { holderName: 'Test User' },
      service: 'account-service',
      ip: '127.0.0.1',
    });

    expect(event.id).toBeDefined();
    expect(event.eventType).toBe('ACCOUNT_CREATED');
    expect(event.metadata.service).toBe('account-service');
    expect(event.metadata.version).toBe('1.0.0');
    expect(event.metadata.ip).toBe('127.0.0.1');

    const store = getEventStore();
    expect(store.count()).toBe(1);
  });
});

describe('createCorrelationId', () => {
  it('should generate unique correlation IDs', () => {
    const id1 = createCorrelationId();
    const id2 = createCorrelationId();
    expect(id1).not.toBe(id2);
    expect(id1.length).toBeGreaterThan(0);
  });
});
