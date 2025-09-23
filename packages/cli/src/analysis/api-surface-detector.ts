import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/logger.js';
import { CodeSymbol, ProjectAST } from './ast-types.js';

export interface APIEndpoint {
  type: 'http' | 'cli' | 'function' | 'class' | 'method';
  path?: string; // For HTTP routes
  method?: string; // HTTP method (GET, POST, etc.)
  command?: string; // CLI command
  name: string;
  signature: string;
  location: {
    file: string;
    line: number;
  };
  parameters: APIParameter[];
  returnType?: string;
  documentation?: string;
  isPublic: boolean;
  framework?: string; // express, fastapi, gin, etc.
}

export interface APIParameter {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  defaultValue?: string;
}

export interface APISurface {
  projectPath: string;
  endpoints: APIEndpoint[];
  publicSymbols: CodeSymbol[];
  httpRoutes: HTTPRoute[];
  cliCommands: CLICommand[];
  exportedFunctions: CodeSymbol[];
  exportedClasses: CodeSymbol[];
  summary: APISummary;
}

export interface HTTPRoute {
  method: string;
  path: string;
  handler: string;
  file: string;
  line: number;
  framework: string;
  middleware?: string[];
}

export interface CLICommand {
  command: string;
  description?: string;
  handler: string;
  file: string;
  line: number;
  framework: string;
  options?: CLIOption[];
}

export interface CLIOption {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  defaultValue?: string;
}

export interface APISummary {
  totalEndpoints: number;
  httpEndpoints: number;
  cliCommands: number;
  publicFunctions: number;
  publicClasses: number;
  frameworks: string[];
  riskScore: number; // 0-100, higher = more risky
}

export class APISurfaceDetector {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Detect all public API surfaces in a project
   */
  async detectAPISurface(
    projectPath: string,
    projectAST: Map<string, ProjectAST>
  ): Promise<APISurface> {
    const endpoints: any[] = [];
    const publicSymbols: CodeSymbol[] = [];
    const httpRoutes: any[] = [];
    const cliCommands: any[] = [];
    
    const exportedFunctions: CodeSymbol[] = [];
    const exportedClasses: CodeSymbol[] = [];

    // Analyze each language's AST
    for (const [language, ast] of projectAST) {
      this.logger.debug(`Analyzing ${language} API surface`);

      // Extract public symbols
      for (const module of ast.modules) {
        const moduleSymbols = await this.extractModuleSymbols(module.filePath, language);
        publicSymbols.push(...moduleSymbols.filter(s => s.isExported));
        exportedFunctions.push(...moduleSymbols.filter(s => s.type === 'function' && s.isExported));
        exportedClasses.push(...moduleSymbols.filter(s => s.type === 'class' && s.isExported));
      }

      // Detect framework-specific APIs
      const languageRoutes = await this.detectHTTPRoutes(ast, language);
      httpRoutes.push(...languageRoutes);

      const languageCommands = await this.detectCLICommands(ast, language);
      cliCommands.push(...languageCommands);
    }

    // Convert to unified endpoint format
    endpoints.push(...this.convertHTTPRoutesToEndpoints(httpRoutes));
    endpoints.push(...this.convertCLICommandsToEndpoints(cliCommands));
    endpoints.push(...this.convertSymbolsToEndpoints(exportedFunctions));
    endpoints.push(...this.convertSymbolsToEndpoints(exportedClasses));

    // Calculate summary
    const summary = this.calculateAPISummary(
      endpoints,
      httpRoutes,
      cliCommands,
      exportedFunctions,
      exportedClasses
    );

    return {
      projectPath,
      endpoints,
      publicSymbols,
      httpRoutes,
      cliCommands,
      exportedFunctions,
      exportedClasses,
      summary,
    };
  }

  /**
   * Detect HTTP routes in different frameworks
   */
  private async detectHTTPRoutes(ast: ProjectAST, language: string): Promise<HTTPRoute[]> {
    const routes: HTTPRoute[] = [];

    for (const module of ast.modules) {
      const content = fs.readFileSync(module.filePath, 'utf8');

      switch (language) {
        case 'typescript':
          routes.push(...this.detectExpressRoutes(content, module.filePath));
          routes.push(...this.detectFastifyRoutes(content, module.filePath));
          break;
        case 'python':
          routes.push(...this.detectFlaskRoutes(content, module.filePath));
          routes.push(...this.detectFastAPIRoutes(content, module.filePath));
          routes.push(...this.detectDjangoRoutes(content, module.filePath));
          break;
        case 'go':
          routes.push(...this.detectGinRoutes(content, module.filePath));
          routes.push(...this.detectGorillaRoutes(content, module.filePath));
          break;
      }
    }

    return routes;
  }

  /**
   * Detect CLI commands in different frameworks
   */
  private async detectCLICommands(ast: ProjectAST, language: string): Promise<CLICommand[]> {
    const commands: CLICommand[] = [];

    for (const module of ast.modules) {
      const content = fs.readFileSync(module.filePath, 'utf8');

      switch (language) {
        case 'typescript':
          commands.push(...this.detectCommanderCommands(content, module.filePath));
          commands.push(...this.detectYargsCommands(content, module.filePath));
          break;
        case 'python':
          commands.push(...this.detectClickCommands(content, module.filePath));
          commands.push(...this.detectArgparseCommands(content, module.filePath));
          break;
        case 'go':
          commands.push(...this.detectCobraCommands(content, module.filePath));
          commands.push(...this.detectFlagCommands(content, module.filePath));
          break;
      }
    }

    return commands;
  }

  // Express.js route detection
  private detectExpressRoutes(content: string, filePath: string): HTTPRoute[] {
    const routes: HTTPRoute[] = [];
    const routePatterns = [
      /(?:app|router)\.(\w+)\(['"`]([^'"`]+)['"`]\s*,\s*([^)]+)\)/g,
      /(?:app|router)\.route\(['"`]([^'"`]+)['"`]\)\.(\w+)\(([^)]+)\)/g,
    ];

    for (const pattern of routePatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const line = content.substring(0, match.index).split('\n').length;

        if (match[0].includes('.route(')) {
          // Handle .route() syntax
          routes.push({
            method: match[2].toUpperCase(),
            path: match[1],
            handler: match[3],
            file: filePath,
            line,
            framework: 'express',
          });
        } else {
          // Handle direct method syntax
          routes.push({
            method: match[1].toUpperCase(),
            path: match[2],
            handler: match[3],
            file: filePath,
            line,
            framework: 'express',
          });
        }
      }
    }

    return routes;
  }

  // Flask route detection
  private detectFlaskRoutes(content: string, filePath: string): HTTPRoute[] {
    const routes: HTTPRoute[] = [];
    const routePattern =
      /@app\.route\(['"`]([^'"`]+)['"`](?:,\s*methods\s*=\s*\[([^\]]+)\])?\)\s*\ndef\s+(\w+)/g;

    const matches = content.matchAll(routePattern);
    for (const match of matches) {
      const line = content.substring(0, match.index).split('\n').length;
      const methods = match[2]
        ? match[2].split(',').map(m => m.trim().replace(/['"]/g, ''))
        : ['GET'];

      for (const method of methods) {
        routes.push({
          method: method.toUpperCase(),
          path: match[1],
          handler: match[3],
          file: filePath,
          line,
          framework: 'flask',
        });
      }
    }

    return routes;
  }

  // FastAPI route detection
  private detectFastAPIRoutes(content: string, filePath: string): HTTPRoute[] {
    const routes: HTTPRoute[] = [];
    const routePattern = /@app\.(\w+)\(['"`]([^'"`]+)['"`]\)\s*(?:async\s+)?def\s+(\w+)/g;

    const matches = content.matchAll(routePattern);
    for (const match of matches) {
      const line = content.substring(0, match.index).split('\n').length;

      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        handler: match[3],
        file: filePath,
        line,
        framework: 'fastapi',
      });
    }

    return routes;
  }

  // Go Gin route detection
  private detectGinRoutes(content: string, filePath: string): HTTPRoute[] {
    const routes: HTTPRoute[] = [];
    const routePattern = /(?:router|r)\.(\w+)\(['"`]([^'"`]+)['"`]\s*,\s*([^)]+)\)/g;

    const matches = content.matchAll(routePattern);
    for (const match of matches) {
      const line = content.substring(0, match.index).split('\n').length;

      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        handler: match[3],
        file: filePath,
        line,
        framework: 'gin',
      });
    }

    return routes;
  }

  // Commander.js command detection
  private detectCommanderCommands(content: string, filePath: string): CLICommand[] {
    const commands: CLICommand[] = [];
    const commandPattern =
      /\.command\(['"`]([^'"`]+)['"`]\)\s*\.description\(['"`]([^'"`]+)['"`]\)/g;

    const matches = content.matchAll(commandPattern);
    for (const match of matches) {
      const line = content.substring(0, match.index).split('\n').length;

      commands.push({
        command: match[1],
        description: match[2],
        handler: 'action', // Would need more analysis to find actual handler
        file: filePath,
        line,
        framework: 'commander',
      });
    }

    return commands;
  }

  // Python Click command detection
  private detectClickCommands(content: string, filePath: string): CLICommand[] {
    const commands: CLICommand[] = [];
    const commandPattern = /@click\.command\(\)\s*(?:@[^\n]*\n)*def\s+(\w+)/g;

    const matches = content.matchAll(commandPattern);
    for (const match of matches) {
      const line = content.substring(0, match.index).split('\n').length;

      commands.push({
        command: match[1],
        handler: match[1],
        file: filePath,
        line,
        framework: 'click',
      });
    }

    return commands;
  }

  // Placeholder implementations for other frameworks
  private detectFastifyRoutes(content: string, filePath: string): HTTPRoute[] {
    return [];
  }
  private detectDjangoRoutes(content: string, filePath: string): HTTPRoute[] {
    return [];
  }
  private detectGorillaRoutes(content: string, filePath: string): HTTPRoute[] {
    return [];
  }
  private detectYargsCommands(content: string, filePath: string): CLICommand[] {
    return [];
  }
  private detectArgparseCommands(content: string, filePath: string): CLICommand[] {
    return [];
  }
  private detectCobraCommands(content: string, filePath: string): CLICommand[] {
    return [];
  }
  private detectFlagCommands(content: string, filePath: string): CLICommand[] {
    return [];
  }

  private async extractModuleSymbols(filePath: string, language: string): Promise<CodeSymbol[]> {
    // This would use the language-specific analyzers we created earlier
    // For now, return empty array as placeholder
    return [];
  }

  private convertHTTPRoutesToEndpoints(routes: HTTPRoute[]): APIEndpoint[] {
    return routes.map(route => ({
      type: 'http' as const,
      method: route.method,
      path: route.path,
      name: `${route.method} ${route.path}`,
      signature: `${route.method} ${route.path} -> ${route.handler}`,
      location: {
        file: route.file,
        line: route.line,
      },
      parameters: [], // Would need more analysis to extract parameters
      isPublic: true,
      framework: route.framework,
    }));
  }

  private convertCLICommandsToEndpoints(commands: CLICommand[]): APIEndpoint[] {
    return commands.map(cmd => ({
      type: 'cli' as const,
      command: cmd.command,
      name: cmd.command,
      signature: cmd.command,
      location: {
        file: cmd.file,
        line: cmd.line,
      },
      parameters:
        cmd.options?.map(opt => ({
          name: opt.name,
          type: opt.type,
          required: opt.required,
          description: opt.description,
          defaultValue: opt.defaultValue,
        })) || [],
      isPublic: true,
      framework: cmd.framework,
    }));
  }

  private convertSymbolsToEndpoints(symbols: CodeSymbol[]): APIEndpoint[] {
    return symbols.map(symbol => ({
      type: symbol.type as any,
      name: symbol.name,
      signature: symbol.signature || symbol.name,
      location: {
        file: symbol.location.file,
        line: symbol.location.startLine,
      },
      parameters:
        symbol.parameters?.map(param => ({
          name: param.name,
          type: param.type,
          required: !param.isOptional,
          defaultValue: param.defaultValue,
        })) || [],
      returnType: symbol.returnType,
      documentation: symbol.documentation,
      isPublic: symbol.isExported,
    }));
  }

  private calculateAPISummary(
    endpoints: APIEndpoint[],
    httpRoutes: HTTPRoute[],
    cliCommands: CLICommand[],
    exportedFunctions: CodeSymbol[],
    exportedClasses: CodeSymbol[]
  ): APISummary {
    const frameworks = new Set<string>();

    httpRoutes.forEach(route => frameworks.add(route.framework));
    cliCommands.forEach(cmd => frameworks.add(cmd.framework));

    // Calculate risk score based on API surface size and complexity
    let riskScore = 0;

    // More endpoints = higher risk
    if (endpoints.length > 50) riskScore += 30;
    else if (endpoints.length > 20) riskScore += 20;
    else if (endpoints.length > 10) riskScore += 10;

    // Multiple frameworks = higher complexity
    if (frameworks.size > 3) riskScore += 20;
    else if (frameworks.size > 1) riskScore += 10;

    // Large number of public functions = potential over-exposure
    if (exportedFunctions.length > 30) riskScore += 15;
    else if (exportedFunctions.length > 15) riskScore += 10;

    return {
      totalEndpoints: endpoints.length,
      httpEndpoints: httpRoutes.length,
      cliCommands: cliCommands.length,
      publicFunctions: exportedFunctions.length,
      publicClasses: exportedClasses.length,
      frameworks: Array.from(frameworks),
      riskScore: Math.min(100, riskScore),
    };
  }
}

function processCodeBlock(
  endpoints: APIEndpoint[],
  publicSymbols: CodeSymbol[],
  httpRoutes: HTTPRoute[],
  cliCommands: CLICommand[]
): void {
  // Process the code block - implementation would go here
  console.log('Processing code block with', {
    endpoints: endpoints.length,
    publicSymbols: publicSymbols.length,
    httpRoutes: httpRoutes.length,
    cliCommands: cliCommands.length
  });
}
