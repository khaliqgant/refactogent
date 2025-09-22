import { Logger } from '../utils/logger.js';
import { Project, SourceFile } from 'ts-morph';
import path from 'path';
import fs from 'fs';

export interface TestCase {
  id: string;
  name: string;
  description: string;
  filePath: string;
  content: string;
  complexity: 'simple' | 'medium' | 'complex';
  refactoringType: 'extract' | 'inline' | 'rename' | 'reorganize' | 'optimize';
  expectedImprovements: string[];
  safetyRequirements: string[];
  styleRequirements: string[];
}

/**
 * Test case generator for standardized refactoring comparisons
 * Creates test cases that demonstrate RefactoGent's competitive advantages
 */
export class TestCaseGenerator {
  private logger: Logger;
  private project: Project;

  constructor(logger: Logger) {
    this.logger = logger;
    this.project = new Project({
      useInMemoryFileSystem: false,
      compilerOptions: {
        target: 99,
        module: 99,
        strict: false,
        allowJs: true,
        checkJs: false,
      },
    });
  }

  /**
   * Generate standardized test cases for competitive comparison
   */
  async generateTestCases(targetPath: string): Promise<TestCase[]> {
    this.logger.info('Generating standardized test cases', { targetPath });

    const testCases: TestCase[] = [];

    try {
      // Analyze target project structure
      const projectStructure = await this.analyzeProjectStructure(targetPath);

      // Generate test cases based on project characteristics
      testCases.push(...this.generateFunctionExtractionCases(projectStructure));
      testCases.push(...this.generateFunctionInliningCases(projectStructure));
      testCases.push(...this.generateSymbolRenamingCases(projectStructure));
      testCases.push(...this.generateCodeReorganizationCases(projectStructure));
      testCases.push(...this.generatePerformanceOptimizationCases(projectStructure));

      this.logger.info('Test cases generated', {
        totalCases: testCases.length,
        byComplexity: this.groupByComplexity(testCases),
        byType: this.groupByType(testCases),
      });

      return testCases;
    } catch (error) {
      this.logger.error('Failed to generate test cases', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate function extraction test cases
   * These demonstrate RefactoGent's deterministic analysis advantage
   */
  private generateFunctionExtractionCases(projectStructure: any): TestCase[] {
    const cases: TestCase[] = [];

    // Simple function extraction
    cases.push({
      id: 'extract-simple-1',
      name: 'Extract Simple Utility Function',
      description: 'Extract a simple utility function from a larger function',
      filePath: 'src/utils/helpers.ts',
      content: `
function processUserData(user: any) {
  // Complex logic that should be extracted
  const isValid = user.email && user.email.includes('@') && user.name && user.name.length > 0;
  const formattedName = user.name.trim().toLowerCase().replace(/\\s+/g, '-');
  const processedEmail = user.email.toLowerCase().trim();
  
  return {
    isValid,
    formattedName,
    processedEmail
  };
}
      `.trim(),
      complexity: 'simple',
      refactoringType: 'extract',
      expectedImprovements: [
        'Extract validation logic into separate function',
        'Extract formatting logic into separate function',
        'Improve code readability and maintainability',
      ],
      safetyRequirements: [
        'Preserve exact validation behavior',
        'Maintain type safety',
        'Ensure no functional regressions',
      ],
      styleRequirements: [
        'Follow project naming conventions',
        'Maintain consistent code style',
        'Add appropriate JSDoc comments',
      ],
    });

    // Complex function extraction
    cases.push({
      id: 'extract-complex-1',
      name: 'Extract Complex Business Logic',
      description: 'Extract complex business logic from a monolithic function',
      filePath: 'src/services/order-processor.ts',
      content: `
async function processOrder(order: Order, user: User, payment: Payment) {
  // Validate order
  if (!order.items || order.items.length === 0) {
    throw new Error('Order must have items');
  }
  
  // Calculate totals
  let subtotal = 0;
  let tax = 0;
  let discount = 0;
  
  for (const item of order.items) {
    subtotal += item.price * item.quantity;
    if (item.taxable) {
      tax += (item.price * item.quantity) * 0.08;
    }
    if (item.discount) {
      discount += item.discount;
    }
  }
  
  const total = subtotal + tax - discount;
  
  // Process payment
  if (payment.method === 'credit_card') {
    const result = await processCreditCardPayment(payment, total);
    if (!result.success) {
      throw new Error('Payment failed');
    }
  }
  
  // Update inventory
  for (const item of order.items) {
    await updateInventory(item.productId, item.quantity);
  }
  
  // Send confirmation
  await sendOrderConfirmation(user.email, order.id, total);
  
  return { success: true, orderId: order.id, total };
}
      `.trim(),
      complexity: 'complex',
      refactoringType: 'extract',
      expectedImprovements: [
        'Extract order validation logic',
        'Extract calculation logic',
        'Extract payment processing logic',
        'Extract inventory update logic',
        'Extract notification logic',
      ],
      safetyRequirements: [
        'Preserve exact calculation logic',
        'Maintain error handling behavior',
        'Ensure transaction atomicity',
        'Preserve async/await patterns',
      ],
      styleRequirements: [
        'Follow service layer patterns',
        'Maintain consistent error handling',
        'Use appropriate logging',
      ],
    });

    return cases;
  }

  /**
   * Generate function inlining test cases
   * These demonstrate RefactoGent's behavior preservation advantage
   */
  private generateFunctionInliningCases(projectStructure: any): TestCase[] {
    const cases: TestCase[] = [];

    cases.push({
      id: 'inline-simple-1',
      name: 'Inline Simple Utility Function',
      description: 'Inline a simple utility function that is only used once',
      filePath: 'src/utils/format.ts',
      content: `
function formatCurrency(amount: number): string {
  return \`$\${amount.toFixed(2)}\`;
}

function displayPrice(product: Product) {
  const formattedPrice = formatCurrency(product.price);
  return \`Price: \${formattedPrice}\`;
}
      `.trim(),
      complexity: 'simple',
      refactoringType: 'inline',
      expectedImprovements: [
        'Inline formatCurrency function',
        'Reduce function call overhead',
        'Simplify code structure',
      ],
      safetyRequirements: [
        'Preserve exact formatting behavior',
        'Maintain type safety',
        'Ensure no functional changes',
      ],
      styleRequirements: ['Maintain readable code', 'Preserve formatting consistency'],
    });

    return cases;
  }

  /**
   * Generate symbol renaming test cases
   * These demonstrate RefactoGent's cross-reference tracking advantage
   */
  private generateSymbolRenamingCases(projectStructure: any): TestCase[] {
    const cases: TestCase[] = [];

    cases.push({
      id: 'rename-medium-1',
      name: 'Rename Function with Multiple References',
      description: 'Rename a function that is used in multiple files',
      filePath: 'src/api/user-service.ts',
      content: `
export function getUserData(userId: string) {
  // Implementation
}

export function processUser(userId: string) {
  const userData = getUserData(userId);
  // Process user data
}
      `.trim(),
      complexity: 'medium',
      refactoringType: 'rename',
      expectedImprovements: [
        'Rename getUserData to fetchUserById',
        'Update all references across files',
        'Update import statements',
        'Maintain API consistency',
      ],
      safetyRequirements: [
        'Update all references correctly',
        'Maintain type safety',
        'Preserve function behavior',
      ],
      styleRequirements: ['Follow naming conventions', 'Maintain consistent API design'],
    });

    return cases;
  }

  /**
   * Generate code reorganization test cases
   * These demonstrate RefactoGent's architectural understanding advantage
   */
  private generateCodeReorganizationCases(projectStructure: any): TestCase[] {
    const cases: TestCase[] = [];

    cases.push({
      id: 'reorganize-complex-1',
      name: 'Reorganize Module Structure',
      description: 'Reorganize code into proper module structure',
      filePath: 'src/components/UserProfile.tsx',
      content: `
// Mixed concerns in single file
function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    fetchUser(userId).then(setUser);
  }, [userId]);
  
  const handleUpdate = async (data: any) => {
    setLoading(true);
    try {
      await updateUser(userId, data);
      setUser(await fetchUser(userId));
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div>
      {loading && <Spinner />}
      {user && <UserForm user={user} onSubmit={handleUpdate} />}
    </div>
  );
}

// Utility functions mixed with component
async function fetchUser(id: string) {
  const response = await fetch(\`/api/users/\${id}\`);
  return response.json();
}

async function updateUser(id: string, data: any) {
  const response = await fetch(\`/api/users/\${id}\`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response.json();
}
      `.trim(),
      complexity: 'complex',
      refactoringType: 'reorganize',
      expectedImprovements: [
        'Separate API functions into service module',
        'Extract custom hooks for data fetching',
        'Create proper component structure',
        'Implement proper error handling',
      ],
      safetyRequirements: [
        'Preserve exact API behavior',
        'Maintain React component lifecycle',
        'Ensure proper state management',
      ],
      styleRequirements: [
        'Follow React best practices',
        'Maintain consistent file structure',
        'Use proper TypeScript types',
      ],
    });

    return cases;
  }

  /**
   * Generate performance optimization test cases
   * These demonstrate RefactoGent's systematic optimization advantage
   */
  private generatePerformanceOptimizationCases(projectStructure: any): TestCase[] {
    const cases: TestCase[] = [];

    cases.push({
      id: 'optimize-medium-1',
      name: 'Optimize Database Query',
      description: 'Optimize inefficient database query patterns',
      filePath: 'src/repositories/user-repository.ts',
      content: `
async function getUsersWithOrders() {
  const users = await db.users.findMany();
  const result = [];
  
  for (const user of users) {
    const orders = await db.orders.findMany({ where: { userId: user.id } });
    const totalSpent = orders.reduce((sum, order) => sum + order.total, 0);
    
    result.push({
      ...user,
      orders,
      totalSpent
    });
  }
  
  return result;
}
      `.trim(),
      complexity: 'medium',
      refactoringType: 'optimize',
      expectedImprovements: [
        'Use database joins instead of N+1 queries',
        'Implement proper aggregation',
        'Add database indexing recommendations',
        'Optimize data fetching patterns',
      ],
      safetyRequirements: [
        'Preserve exact query results',
        'Maintain data consistency',
        'Ensure proper error handling',
      ],
      styleRequirements: [
        'Follow database best practices',
        'Maintain consistent query patterns',
        'Use proper TypeScript types',
      ],
    });

    return cases;
  }

  /**
   * Analyze project structure to inform test case generation
   */
  private async analyzeProjectStructure(targetPath: string): Promise<any> {
    const stats = {
      totalFiles: 0,
      languageDistribution: {} as Record<string, number>,
      complexityLevels: { simple: 0, medium: 0, complex: 0 },
      refactoringOpportunities: [] as string[],
    };

    // Analyze files in target path
    const files = await this.getProjectFiles(targetPath);
    stats.totalFiles = files.length;

    for (const file of files) {
      const ext = path.extname(file);
      stats.languageDistribution[ext] = (stats.languageDistribution[ext] || 0) + 1;
    }

    return stats;
  }

  /**
   * Get all project files for analysis
   */
  private async getProjectFiles(targetPath: string): Promise<string[]> {
    const files: string[] = [];

    const scanDir = async (dir: string) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await scanDir(fullPath);
        } else if (entry.isFile() && this.isSourceFile(entry.name)) {
          files.push(fullPath);
        }
      }
    };

    await scanDir(targetPath);
    return files;
  }

  /**
   * Check if file is a source file
   */
  private isSourceFile(filename: string): boolean {
    const ext = path.extname(filename);
    return ['.ts', '.tsx', '.js', '.jsx', '.py', '.go'].includes(ext);
  }

  /**
   * Group test cases by complexity
   */
  private groupByComplexity(testCases: TestCase[]): Record<string, number> {
    return testCases.reduce(
      (acc, tc) => {
        acc[tc.complexity] = (acc[tc.complexity] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  /**
   * Group test cases by type
   */
  private groupByType(testCases: TestCase[]): Record<string, number> {
    return testCases.reduce(
      (acc, tc) => {
        acc[tc.refactoringType] = (acc[tc.refactoringType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }
}
