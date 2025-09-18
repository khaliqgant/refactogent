import { BaseCommand } from './base.js';
import { CommandResult } from '../types/index.js';
import { SampleProjectGenerator, SampleProjectConfig } from '../generators/sample-project-generator.js';

interface GenerateOptions {
  name?: string;
  type?: 'typescript' | 'python' | 'go';
  complexity?: 'simple' | 'medium' | 'complex';
  hasTests?: boolean;
  hasConfig?: boolean;
  suite?: boolean;
  output?: string;
}

export class GenerateCommand extends BaseCommand {
  async execute(options: GenerateOptions): Promise<CommandResult> {
    this.logger.info('Starting sample project generation', options);
    
    const outputDir = options.output || './test-projects';
    const generator = new SampleProjectGenerator(this.logger, outputDir);
    
    try {
      if (options.suite) {
        // Generate full test suite
        this.logger.info('Generating comprehensive test suite');
        const generatedPaths = await generator.generateTestSuite();
        
        return this.success(
          `Generated ${generatedPaths.length} sample projects for testing`,
          [],
          { 
            projectCount: generatedPaths.length,
            projects: generatedPaths.map(p => p.split('/').pop()),
            outputDir
          }
        );
      } else {
        // Generate single project
        const config: SampleProjectConfig = {
          name: options.name || 'sample-project',
          type: options.type || 'typescript',
          complexity: options.complexity || 'medium',
          hasTests: options.hasTests ?? true,
          hasConfig: options.hasConfig ?? false
        };
        
        const projectPath = await generator.generateProject(config);
        
        return this.success(
          `Generated sample project: ${config.name}`,
          [],
          { 
            projectPath,
            config
          }
        );
      }
    } catch (error) {
      return this.failure(
        `Failed to generate sample project(s): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}