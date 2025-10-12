import { FunctionB, TypeFromB } from './FileB.js';

export interface TypeFromA {
  name: string;
  valueFromB: TypeFromB;
}

export function FunctionA(input: string): TypeFromA {
  const bResult = FunctionB(input);
  return {
    name: `A:${input}`,
    valueFromB: bResult
  };
}

export class ClassA {
  process(data: TypeFromB): string {
    return `ClassA processed: ${data.value}`;
  }
}
