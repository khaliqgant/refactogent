import { LogEntry } from '../types/index.js';

export class Logger {
  private verbose: boolean;

  constructor(verbose = false) {
    this.verbose = verbose;
  }

  private createLogEntry(
    level: LogEntry['level'],
    message: string,
    context?: Record<string, any>
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };
  }

  private formatMessage(entry: LogEntry): string {
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    const level = entry.level.toUpperCase().padEnd(5);
    let message = `[${timestamp}] ${level} ${entry.message}`;

    if (entry.context && Object.keys(entry.context).length > 0) {
      message += ` ${JSON.stringify(entry.context)}`;
    }

    return message;
  }

  debug(message: string, context?: Record<string, any>): void {
    if (this.verbose) {
      const entry = this.createLogEntry('debug', message, context);
      console.debug(this.formatMessage(entry));
    }
  }

  info(message: string, context?: Record<string, any>): void {
    const entry = this.createLogEntry('info', message, context);
    console.log(this.formatMessage(entry));
  }

  warn(message: string, context?: Record<string, any>): void {
    const entry = this.createLogEntry('warn', message, context);
    console.warn(this.formatMessage(entry));
  }

  error(message: string, context?: Record<string, any>): void {
    const entry = this.createLogEntry('error', message, context);
    console.error(this.formatMessage(entry));
  }

  success(message: string, context?: Record<string, any>): void {
    const entry = this.createLogEntry('info', `✅ ${message}`, context);
    console.log(this.formatMessage(entry));
  }

  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }
}
