import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { CommandContext, CommandResult } from '../types/index.js';
import { Logger } from '../utils/logger.js';

export abstract class BaseCommand {
  protected logger: Logger;
  protected context?: CommandContext;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Set the command context
   */
  setContext(context: CommandContext): void {
    this.context = context;
  }

  /**
   * Execute the command
   */
  abstract execute(...args: any[]): Promise<CommandResult>;

  /**
   * Validate command prerequisites
   */
  protected validateContext(): void {
    if (!this.context) {
      throw new Error('Command context not set');
    }
  }

  /**
   * Ensure output directory exists
   */
  protected ensureOutputDir(): void {
    if (!this.context) return;
    
    if (!fs.existsSync(this.context.outputDir)) {
      fs.mkdirSync(this.context.outputDir, { recursive: true });
      this.logger.debug('Created output directory', { path: this.context.outputDir });
    }
  }

  /**
   * Write file to output directory
   */
  protected writeOutput(filename: string, content: string): string {
    if (!this.context) throw new Error('Context not set');
    
    this.ensureOutputDir();
    const filePath = path.join(this.context.outputDir, filename);
    fs.writeFileSync(filePath, content, 'utf8');
    
    this.logger.debug('Wrote output file', { path: filePath });
    return filePath;
  }

  /**
   * Create a success result
   */
  protected success(message: string, artifacts?: string[], data?: any): CommandResult {
    return {
      success: true,
      message,
      artifacts,
      data
    };
  }

  /**
   * Create a failure result
   */
  protected failure(message: string, data?: any): CommandResult {
    return {
      success: false,
      message,
      data
    };
  }
}