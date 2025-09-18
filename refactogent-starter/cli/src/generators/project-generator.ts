import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/logger.js';

export interface ProjectConfig {
  name: string;
  type: 'typescript' | 'python' | 'go';
  complexity: 'simple' | 'medium' | 'complex';
  hasTests: boolean;
  hasConfig: boolean;
}

export class ProjectGenerator {
  private logger: Logger;
  private outputDir: string;

  constructor(logger: Logger, outputDir = './test-projects') {
    this.logger = logger;
    this.outputDir = outputDir;
  }

  async generateProject(config: ProjectConfig): Promise<string> {
    const projectPath = path.join(this.outputDir, config.name);
    
    this.logger.info('Generating sample project', config);

    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    switch (config.type) {
      case 'typescript':
        this.createTypeScriptProject(projectPath, config);
        break;
      case 'python':
        this.createPythonProject(projectPath, config);
        break;
      case 'go':
        this.createGoProject(projectPath, config);
        break;
    }

    this.logger.success('Sample project generated', { path: projectPath });
    return projectPath;
  }

  async generateTestSuite(): Promise<string[]> {
    const projects: ProjectConfig[] = [
      { name: 'ts-simple', type: 'typescript', complexity: 'simple', hasTests: false, hasConfig: false },
      { name: 'ts-medium', type: 'typescript', complexity: 'medium', hasTests: true, hasConfig: false },
      { name: 'py-simple', type: 'python', complexity: 'simple', hasTests: false, hasConfig: false },
      { name: 'go-simple', type: 'go', complexity: 'simple', hasTests: false, hasConfig: false }
    ];

    const generatedPaths: string[] = [];
    
    for (const project of projects) {
      try {
        const projectPath = await this.generateProject(project);
        generatedPaths.push(projectPath);
      } catch (error) {
        this.logger.error('Failed to generate project', { 
          project: project.name, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }

    return generatedPaths;
  }

  private createTypeScriptProject(projectPath: string, config: ProjectConfig): void {
    // Package.json
    const packageJson = {
      name: config.name,
      version: '1.0.0',
      main: 'dist/index.js',
      scripts: {
        build: 'tsc',
        test: config.hasTests ? 'jest' : 'echo "No tests"',
        start: 'node dist/index.js'
      },
      devDependencies: {
        typescript: '^5.0.0',
        '@types/node': '^20.0.0'
      }
    };
    
    fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify(packageJson, null, 2));

    // TypeScript config
    const tsConfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        outDir: './dist',
        rootDir: './src',
        strict: true
      }
    };
    
    fs.writeFileSync(path.join(projectPath, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2));

    // Source code
    const srcDir = path.join(projectPath, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    
    const content = `// Sample TypeScript code with refactoring opportunities
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

console.log('TypeScript sample ready');`;
    
    fs.writeFileSync(path.join(srcDir, 'index.ts'), content);
    
    if (config.hasConfig) {
      this.createRefactogentConfig(projectPath);
    }
  }

  private createPythonProject(projectPath: string, config: ProjectConfig): void {
    const requirements = ['requests==2.31.0'];
    if (config.hasTests) requirements.push('pytest==7.4.2');
    
    fs.writeFileSync(path.join(projectPath, 'requirements.txt'), requirements.join('\n'));

    const content = `# Sample Python code with refactoring opportunities
def calculate_total(items):
    total = 0
    for item in items:
        if 'price' in item and 'quantity' in item:
            total += item['price'] * item['quantity']
    return total

# Magic numbers that should be constants  
def get_discount(total):
    if total > 100:
        return 0.1
    elif total > 50:
        return 0.05
    return 0

if __name__ == "__main__":
    print("Python sample ready")`;
    
    fs.writeFileSync(path.join(projectPath, 'main.py'), content);
    
    if (config.hasConfig) {
      this.createRefactogentConfig(projectPath);
    }
  }

  private createGoProject(projectPath: string, config: ProjectConfig): void {
    const goMod = `module ${config.name}

go 1.19`;
    
    fs.writeFileSync(path.join(projectPath, 'go.mod'), goMod);

    const content = `package main

import "fmt"

// Sample Go code with refactoring opportunities
func CalculateTotal(items []map[string]interface{}) float64 {
    total := 0.0
    for _, item := range items {
        if price, ok := item["price"].(float64); ok {
            if quantity, ok := item["quantity"].(float64); ok {
                total += price * quantity
            }
        }
    }
    return total
}

// Magic numbers that should be constants
func GetDiscount(total float64) float64 {
    if total > 100 {
        return 0.1
    } else if total > 50 {
        return 0.05
    }
    return 0
}

func main() {
    fmt.Println("Go sample ready")
}`;
    
    fs.writeFileSync(path.join(projectPath, 'main.go'), content);
    
    if (config.hasConfig) {
      this.createRefactogentConfig(projectPath);
    }
  }

  private createRefactogentConfig(projectPath: string): void {
    const config = `version: 1
maxPrLoc: 300
branchPrefix: "refactor/"
modesAllowed:
  - "organize-only"
  - "name-hygiene" 
  - "tests-first"
  - "micro-simplify"
gates:
  requireCharacterizationTests: true
  requireGreenCi: true
  minLineCoverageDelta: ">=0"
  forbidPublicApiChanges: true`;
    
    fs.writeFileSync(path.join(projectPath, '.refactor-agent.yaml'), config);
  }
}