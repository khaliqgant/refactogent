import { User } from '../models/User.js';
import { DatabaseConnection } from '../utils/database.js';

export interface AuditLog {
  id: string;
  action: string;
  userId: string;
  details: string;
  timestamp: Date;
}

export class AuditService {
  constructor(private db: DatabaseConnection) {}

  async logUserCreated(user: User): Promise<void> {
    await this.createLog('USER_CREATED', user.id, `User created: ${user.email}`);
  }

  async logUserUpdated(user: User): Promise<void> {
    await this.createLog('USER_UPDATED', user.id, `User updated: ${user.email}`);
  }

  async logUserDeleted(user: User): Promise<void> {
    await this.createLog('USER_DELETED', user.id, `User deleted: ${user.email}`);
  }

  private async createLog(action: string, userId: string, details: string): Promise<void> {
    const log: AuditLog = {
      id: this.generateId(),
      action,
      userId,
      details,
      timestamp: new Date()
    };

    await this.db.execute(
      'INSERT INTO audit_logs (id, action, user_id, details, timestamp) VALUES (?, ?, ?, ?, ?)',
      [log.id, log.action, log.userId, log.details, log.timestamp]
    );
  }

  async getLogsForUser(userId: string): Promise<AuditLog[]> {
    return await this.db.query<AuditLog>(
      'SELECT * FROM audit_logs WHERE user_id = ? ORDER BY timestamp DESC',
      [userId]
    );
  }

  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
