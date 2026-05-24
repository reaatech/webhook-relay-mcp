import { DatabaseService } from '../database.js';
import { AuditRepository } from '../repositories/audit.js';

export class AuditService {
  private static instance: AuditService;
  private repo: AuditRepository | null = null;

  static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  async log(
    actor: string,
    action: string,
    resourceType: string,
    resourceId: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    const repo = this.getRepo();
    await repo.create({ actor, action, resourceType, resourceId, details });
  }

  private getRepo(): AuditRepository {
    if (!this.repo) {
      this.repo = new AuditRepository(DatabaseService.getInstance().getDatabase());
    }
    return this.repo;
  }
}
