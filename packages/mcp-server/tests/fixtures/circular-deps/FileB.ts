import { FunctionA, TypeFromA, ClassA } from './FileA.js';

export interface TypeFromB {
  value: number;
  related: TypeFromA | null;
}

export function FunctionB(input: string): TypeFromB {
  // This creates a circular dependency
  const classA = new ClassA();
  return {
    value: input.length,
    related: null
  };
}

export function processWithA(data: string): string {
  const aResult = FunctionA(data);
  return `B processed A: ${aResult.name}`;
}
