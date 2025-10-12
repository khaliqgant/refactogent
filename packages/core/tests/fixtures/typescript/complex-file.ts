import { Calculator } from './class-example.js';
import * as fs from 'fs';

/**
 * Complex file with multiple functions and control flow
 */
export class ComplexProcessor {
  private calculator: Calculator;
  private data: any[] = [];

  constructor() {
    this.calculator = new Calculator();
  }

  public async processData(input: string[]): Promise<number[]> {
    const results: number[] = [];
    
    for (const item of input) {
      if (item.length > 0) {
        try {
          const processed = await this._processItem(item);
          results.push(processed);
        } catch (error) {
          console.error('Error processing item:', error);
        }
      }
    }
    
    return results;
  }

  private async _processItem(item: string): Promise<number> {
    switch (item.charAt(0)) {
      case 'A':
        return this._handleTypeA(item);
      case 'B':
        return this._handleTypeB(item);
      default:
        return 0;
    }
  }

  private _handleTypeA(item: string): number {
    if (item.length > 5) {
      return item.length * 2;
    } else {
      return item.length;
    }
  }

  private _handleTypeB(item: string): number {
    return item.length * 3;
  }
}

// Function with complex logic
export function analyzeComplexity(code: string): { complexity: number; functions: number } {
  let complexity = 0;
  let functions = 0;
  
  const lines = code.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.includes('if') || trimmed.includes('else')) {
      complexity++;
    }
    
    if (trimmed.includes('for') || trimmed.includes('while')) {
      complexity++;
    }
    
    if (trimmed.includes('function') || trimmed.includes('=>')) {
      functions++;
    }
  }
  
  return { complexity, functions };
}
