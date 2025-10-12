import { User, UserCreateInput, UserUpdateInput, UserValidator } from '../models/User.js';
import { DatabaseConnection } from '../utils/database.js';
import { AuditService } from './AuditService.js';

export class UserService {
  constructor(
    private db: DatabaseConnection,
    private auditService: AuditService
  ) {}

  async createUser(input: UserCreateInput): Promise<User> {
    // Validate input
    if (!UserValidator.validateEmail(input.email)) {
      throw new Error('Invalid email');
    }
    if (!UserValidator.validateName(input.name)) {
      throw new Error('Invalid name');
    }

    const now = new Date();
    const user: User = {
      id: this.generateId(),
      email: input.email,
      name: input.name,
      role: input.role || 'user' as any,
      createdAt: now,
      updatedAt: now
    };

    // Save to database
    await this.db.execute(
      'INSERT INTO users (id, email, name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [user.id, user.email, user.name, user.role, user.createdAt, user.updatedAt]
    );

    // Audit log
    await this.auditService.logUserCreated(user);

    return user;
  }

  async getUserById(id: string): Promise<User | null> {
    const results = await this.db.query<User>(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );

    return results[0] || null;
  }

  async updateUser(id: string, input: UserUpdateInput): Promise<User> {
    const user = await this.getUserById(id);
    if (!user) {
      throw new Error('User not found');
    }

    if (input.email && !UserValidator.validateEmail(input.email)) {
      throw new Error('Invalid email');
    }
    if (input.name && !UserValidator.validateName(input.name)) {
      throw new Error('Invalid name');
    }

    const updatedUser: User = {
      ...user,
      email: input.email || user.email,
      name: input.name || user.name,
      role: input.role || user.role,
      updatedAt: new Date()
    };

    await this.db.execute(
      'UPDATE users SET email = ?, name = ?, role = ?, updated_at = ? WHERE id = ?',
      [updatedUser.email, updatedUser.name, updatedUser.role, updatedUser.updatedAt, id]
    );

    await this.auditService.logUserUpdated(updatedUser);

    return updatedUser;
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.getUserById(id);
    if (!user) {
      throw new Error('User not found');
    }

    await this.db.execute('DELETE FROM users WHERE id = ?', [id]);
    await this.auditService.logUserDeleted(user);
  }

  async listUsers(): Promise<User[]> {
    return await this.db.query<User>('SELECT * FROM users ORDER BY created_at DESC');
  }

  private generateId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
