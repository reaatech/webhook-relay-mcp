import { DatabaseService } from './database.js';
import { MigrationService } from './migrations.js';
import { AuditRepository } from './repositories/audit.js';
import { EventRepository } from './repositories/events.js';
import { SourceRepository } from './repositories/sources.js';
import { SubscriptionRepository } from './repositories/subscriptions.js';

export class StorageService {
  private static instance: StorageService;
  private dbService: DatabaseService;
  private auditRepo: AuditRepository | null = null;
  private eventRepo: EventRepository | null = null;
  private subscriptionRepo: SubscriptionRepository | null = null;
  private sourceRepo: SourceRepository | null = null;

  private constructor() {
    this.dbService = DatabaseService.getInstance();
  }

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  async initialize(): Promise<void> {
    const db = this.dbService.connect();
    MigrationService.run(db);
  }

  get audit(): AuditRepository {
    if (!this.auditRepo) {
      this.auditRepo = new AuditRepository(this.dbService.getDatabase());
    }
    return this.auditRepo;
  }

  get events(): EventRepository {
    if (!this.eventRepo) {
      this.eventRepo = new EventRepository(this.dbService.getDatabase());
    }
    return this.eventRepo;
  }

  get subscriptions(): SubscriptionRepository {
    if (!this.subscriptionRepo) {
      this.subscriptionRepo = new SubscriptionRepository(this.dbService.getDatabase());
    }
    return this.subscriptionRepo;
  }

  get sources(): SourceRepository {
    if (!this.sourceRepo) {
      this.sourceRepo = new SourceRepository(this.dbService.getDatabase());
    }
    return this.sourceRepo;
  }

  async shutdown(): Promise<void> {
    this.dbService.close();
  }
}

export { DatabaseService } from './database.js';
export { MigrationService } from './migrations.js';
export type { AuditEntity, AuditListOptions } from './repositories/audit.js';
export { AuditRepository } from './repositories/audit.js';
export type { ListOptions } from './repositories/base.js';
export { BaseRepository } from './repositories/base.js';
export type { EventEntity, EventFilters } from './repositories/events.js';
export { EventRepository } from './repositories/events.js';
export type { WebhookSourceEntity } from './repositories/sources.js';
export { SourceRepository } from './repositories/sources.js';
export type { SubscriptionEntity } from './repositories/subscriptions.js';
export { SubscriptionRepository } from './repositories/subscriptions.js';
export { SCHEMA } from './schema.js';
export { AuditService } from './services/audit.js';
export { CleanupService } from './services/cleanup.js';
export { DeliveryService } from './services/delivery.js';
export { formatEvent, PollWaiterService } from './services/poll-waiter.js';
export type { SourceHealth } from './services/source-health.js';
export { SourceHealthService } from './services/source-health.js';
