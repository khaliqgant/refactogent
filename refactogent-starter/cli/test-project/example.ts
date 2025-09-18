// Example TypeScript file for testing refactoring suggestions

export class Calculator {
  // Complex function that could be refactored
  public calculateComplexResult(a: number, b: number, c: number, d: number, e: number): number {
    if (a > 0) {
      if (b > 0) {
        if (c > 0) {
          if (d > 0) {
            if (e > 0) {
              const result = a * b + c * d - e;
              const adjustedResult = result > 100 ? result * 0.9 : result * 1.1;
              const finalResult = adjustedResult + (a + b + c + d + e) / 5;
              return finalResult;
            }
          }
        }
      }
    }
    return 0;
  }

  // Function with magic numbers
  public processData(data: number[]): number[] {
    return data.map(x => x * 3.14159 + 42).filter(x => x > 100);
  }

  // Unused import would be detected here
  public simpleAdd(x: number, y: number): number {
    return x + y;
  }
}