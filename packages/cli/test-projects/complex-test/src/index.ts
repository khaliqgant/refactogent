// Sample TypeScript code with refactoring opportunities
export function calculateTotal(items: any[]) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i].price && items[i].quantity) {
      total += items[i].price * items[i].quantity;
    }
  }
  return total;
}

// Magic numbers that should be constants
export function getDiscount(total: number) {
  if (total > 100) {
    return 0.1;
  } else if (total > 50) {
    return 0.05;
  }
  return 0;
}

console.log('TypeScript sample ready');