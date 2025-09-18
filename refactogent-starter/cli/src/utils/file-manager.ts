import fs from 'fs';
import path from 'path';
import { Logger } from './logger.js';

export interface BackupInfo {
  originalPath: string;
  backupPath: string;
  timestamp: string;
}

export class FileManager {
  private logger: Logger;
  private backups: Map<string, BackupInfo> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Create a backup of a file before modifying it
   */
  createBackup(filePath: string): BackupInfo {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(path.dirname(filePath), '.refactogent', 'backups');
    const fileName = path.basename(filePath);
    const backupPath = path.join(backupDir, `${fileName}.${timestamp}.backup`);

    // Ensure backup directory exists
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Copy original file to backup
    fs.copyFileSync(filePath, backupPath);

    const backupInfo: BackupInfo = {
      originalPath: filePath,
      backupPath,
      timestamp
    };

    this.backups.set(filePath, backupInfo);
    this.logger.debug('Created backup', { original: filePath, backup: backupPath });

    return backupInfo;
  }

  /**
   * Apply changes to a file with backup
   */
  applyChanges(filePath: string, newContent: string): boolean {
    try {
      // Create backup first
      this.createBackup(filePath);

      // Write new content
      fs.writeFileSync(filePath, newContent, 'utf8');
      
      this.logger.info('Applied changes to file', { path: filePath });
      return true;
    } catch (error) {
      this.logger.error('Failed to apply changes', { 
        path: filePath, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Restore a file from backup
   */
  restoreFromBackup(filePath: string): boolean {
    const backupInfo = this.backups.get(filePath);
    if (!backupInfo || !fs.existsSync(backupInfo.backupPath)) {
      this.logger.error('No backup found for file', { path: filePath });
      return false;
    }

    try {
      fs.copyFileSync(backupInfo.backupPath, filePath);
      this.logger.info('Restored file from backup', { 
        path: filePath, 
        backup: backupInfo.backupPath 
      });
      return true;
    } catch (error) {
      this.logger.error('Failed to restore from backup', { 
        path: filePath, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Get all backups created in this session
   */
  getBackups(): BackupInfo[] {
    return Array.from(this.backups.values());
  }

  /**
   * Clean up old backups (older than specified days)
   */
  cleanupOldBackups(projectPath: string, daysOld = 7): void {
    const backupDir = path.join(projectPath, '.refactogent', 'backups');
    
    if (!fs.existsSync(backupDir)) {
      return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    try {
      const files = fs.readdirSync(backupDir);
      let cleanedCount = 0;

      for (const file of files) {
        if (file.endsWith('.backup')) {
          const filePath = path.join(backupDir, file);
          const stats = fs.statSync(filePath);
          
          if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filePath);
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        this.logger.info('Cleaned up old backups', { count: cleanedCount });
      }
    } catch (error) {
      this.logger.warn('Failed to cleanup old backups', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * Validate file can be safely modified
   */
  canModifyFile(filePath: string): { canModify: boolean; reason?: string } {
    if (!fs.existsSync(filePath)) {
      return { canModify: false, reason: 'File does not exist' };
    }

    try {
      const stats = fs.statSync(filePath);
      
      if (!stats.isFile()) {
        return { canModify: false, reason: 'Path is not a file' };
      }

      // Check if file is writable
      fs.accessSync(filePath, fs.constants.W_OK);

      // Check file size (avoid very large files)
      if (stats.size > 1024 * 1024) { // 1MB limit
        return { canModify: false, reason: 'File too large (>1MB)' };
      }

      return { canModify: true };
    } catch (error) {
      return { 
        canModify: false, 
        reason: `Access error: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }
}