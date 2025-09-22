/**
 * Test case interface for competitive comparison
 */
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
