import { describe, it, expect, beforeEach } from '@jest/globals';
import { UserService } from '../src/services/UserService';
import { DatabaseConnection } from '../src/utils/database';
import { AuditService } from '../src/services/AuditService';
import { UserRole } from '../src/models/User';

describe('UserService', () => {
  let userService: UserService;
  let db: DatabaseConnection;
  let auditService: AuditService;

  beforeEach(() => {
    db = new DatabaseConnection({
      host: 'localhost',
      port: 5432,
      database: 'test',
      user: 'test',
      password: 'test'
    });
    auditService = new AuditService(db);
    userService = new UserService(db, auditService);
  });

  describe('createUser', () => {
    it('should create a user with valid input', async () => {
      const input = {
        email: 'test@example.com',
        name: 'Test User',
        role: UserRole.USER
      };

      const user = await userService.createUser(input);

      expect(user).toBeDefined();
      expect(user.email).toBe(input.email);
      expect(user.name).toBe(input.name);
      expect(user.role).toBe(input.role);
    });

    it('should throw error for invalid email', async () => {
      const input = {
        email: 'invalid-email',
        name: 'Test User'
      };

      await expect(userService.createUser(input)).rejects.toThrow('Invalid email');
    });

    it('should throw error for invalid name', async () => {
      const input = {
        email: 'test@example.com',
        name: 'a' // Too short
      };

      await expect(userService.createUser(input)).rejects.toThrow('Invalid name');
    });
  });

  describe('getUserById', () => {
    it('should return user if exists', async () => {
      const created = await userService.createUser({
        email: 'test@example.com',
        name: 'Test User'
      });

      const user = await userService.getUserById(created.id);
      expect(user).toBeDefined();
      expect(user?.id).toBe(created.id);
    });

    it('should return null if user not found', async () => {
      const user = await userService.getUserById('nonexistent');
      expect(user).toBeNull();
    });
  });
});
