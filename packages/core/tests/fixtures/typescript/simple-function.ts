/**
 * A simple function that adds two numbers
 * @param a First number
 * @param b Second number
 * @returns The sum of a and b
 */
export function add(a: number, b: number): number {
  return a + b;
}

// Private function (should be detected as private)
function _privateHelper(): void {
  console.log('This is private');
}

// Exported variable
export const PI = 3.14159;

// Non-exported variable (should be filtered out)
const _privateVar = 'secret';
