import { TypeFromA } from './FileA.js';
import { TypeFromB } from './FileB.js';

// FileC uses both A and B but doesn't create circular dependency
export interface CombinedType {
  fromA: TypeFromA;
  fromB: TypeFromB;
}

export function combineAandB(a: TypeFromA, b: TypeFromB): CombinedType {
  return { fromA: a, fromB: b };
}
