/**
 * A sample class for testing
 */
export class Calculator {
  private value: number = 0;

  /**
   * Add a number to the current value
   * @param num Number to add
   */
  public add(num: number): void {
    this.value += num;
  }

  /**
   * Get the current value
   * @returns Current value
   */
  public getValue(): number {
    return this.value;
  }

  private _reset(): void {
    this.value = 0;
  }
}

// Interface
export interface MathOperation {
  (a: number, b: number): number;
}

// Type alias
export type NumberPair = [number, number];

// Enum
export enum OperationType {
  ADD = 'add',
  SUBTRACT = 'subtract',
  MULTIPLY = 'multiply',
  DIVIDE = 'divide'
}
