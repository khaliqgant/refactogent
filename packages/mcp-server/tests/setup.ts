import { jest } from '@jest/globals';

// Extend test timeout for integration tests
jest.setTimeout(60000);

// Mock console.error to reduce noise in tests
global.console.error = jest.fn();
