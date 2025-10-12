export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  GUEST = 'guest'
}

export interface UserCreateInput {
  email: string;
  name: string;
  role?: UserRole;
}

export interface UserUpdateInput {
  email?: string;
  name?: string;
  role?: UserRole;
}

export class UserValidator {
  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static validateName(name: string): boolean {
    return name.length >= 2 && name.length <= 100;
  }

  static validateRole(role: UserRole): boolean {
    return Object.values(UserRole).includes(role);
  }
}
