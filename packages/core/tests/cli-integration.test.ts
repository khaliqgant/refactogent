import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

describe('CLI Integration Tests', () => {
  let cliPath: string;
  let fixturesPath: string;

  beforeEach(() => {
    cliPath = path.join(__dirname, '../../cli/dist/index.js');
    fixturesPath = path.join(__dirname, 'fixtures');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('CLI Command Execution', () => {
    it('should run refactor command successfully', (done) => {
      const child = spawn('node', [cliPath, 'refactor', fixturesPath, '--verbose'], {
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe'
      });

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        expect(code).toBe(0);
        expect(output).toContain('🚀 RefactoGent: Complete AI-Powered Refactoring Workflow');
        expect(output).toContain('🔍 Starting codebase indexing...');
        expect(output).toContain('✅ Successfully indexed');
        expect(output).toContain('📁 Sample refactorable files:');
        done();
      });
    }, 30000);

    it('should handle invalid path gracefully', (done) => {
      const child = spawn('node', [cliPath, 'refactor', '/nonexistent/path'], {
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe'
      });

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        // Should either succeed (with empty results) or fail gracefully
        expect([0, 1]).toContain(code);
        done();
      });
    }, 30000);

    it('should show help when no arguments provided', (done) => {
      const child = spawn('node', [cliPath], {
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe'
      });

      let output = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        expect(code).toBe(1);
        expect(output).toContain('Usage: refactogent [options] [command]');
        expect(output).toContain('RefactoGent CLI');
        done();
      });
    }, 10000);

    it('should show version information', (done) => {
      const child = spawn('node', [cliPath, '--version'], {
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe'
      });

      let output = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        expect(code).toBe(0);
        expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
        done();
      });
    }, 10000);
  });

  describe('CLI Options', () => {
    it('should respect verbose flag', (done) => {
      const child = spawn('node', [cliPath, 'refactor', fixturesPath, '--verbose'], {
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe'
      });

      let output = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        expect(code).toBe(0);
        expect(output).toContain('Starting codebase indexing...');
        done();
      });
    }, 30000);

    it('should respect include-tests flag', (done) => {
      const child = spawn('node', [cliPath, 'refactor', fixturesPath, '--include-tests'], {
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe'
      });

      let output = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        expect(code).toBe(0);
        expect(output).toContain('Successfully indexed');
        done();
      });
    }, 30000);

    it('should respect output directory option', (done) => {
      const child = spawn('node', [cliPath, 'refactor', fixturesPath, '-o', '/tmp/test-output'], {
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe'
      });

      let output = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        expect(code).toBe(0);
        expect(output).toContain('Successfully indexed');
        done();
      });
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle missing CLI file gracefully', (done) => {
      const child = spawn('node', ['/nonexistent/cli.js', 'refactor'], {
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe'
      });

      child.on('close', (code) => {
        expect(code).not.toBe(0);
        done();
      });
    }, 10000);

    it('should handle invalid command gracefully', (done) => {
      const child = spawn('node', [cliPath, 'invalid-command'], {
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe'
      });

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        expect(code).toBe(1);
        expect(errorOutput).toContain('unknown command');
        done();
      });
    }, 10000);
  });
});
