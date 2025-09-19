import fs from 'fs';
import path from 'path';
import { Project, SourceFile, Node, SyntaxKind } from 'ts-morph';
import { ASTAnalyzer } from './ast-analyzer.js';
import {
  ProjectAST,
  ModuleAST,
  ASTNode,
  CodeSymbol,
  ClassInfo,
  FunctionInfo,
  MethodInfo,
  PropertyInfo,
  InterfaceInfo,
  SourceLocation,
  ImportDeclaration,
} from './ast-types.js';
import { Logger } from '../utils/logger.js';

export class TypeScriptAnalyzer extends ASTAnalyzer {
  private project: Project;

  constructor(logger: Logger, projectPath: string) {
    super(logger, projectPath);
    this.project = new Project({
      tsConfigFilePath: this.findTsConfig(projectPath),
      skipAddingFilesFromTsConfig: false,
      skipFileDependencyResolution: true,
    });
  }

  async analyzeProject(): Promise<ProjectAST> {
    this.logger.info('Starting TypeScript project analysis', { projectPath: this.projectPath });

    // Get all TypeScript files
    const sourceFiles = this.project.getSourceFiles();
    const modules: ModuleAST[] = [];

    for (const sourceFile of sourceFiles) {
      try {
        const moduleAST = await this.analyzeSourceFile(sourceFile);
        modules.push(moduleAST);
      } catch (error) {
        this.logger.warn('Failed to analyze file', {
          file: sourceFile.getFilePath(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const dependencies = this.buildDependencyGraph(modules);
    const exports = this.buildExportMap(modules);
    const imports = this.buildImportMap(modules);
    const metrics = this.calculateProjectMetrics(modules);

    return {
      projectPath: this.projectPath,
      language: 'typescript',
      modules,
      dependencies,
      exports,
      imports,
      metrics,
    };
  }

  async analyzeFile(filePath: string): Promise<ModuleAST> {
    const sourceFile = this.project.getSourceFile(filePath);
    if (!sourceFile) {
      throw new Error(`File not found: ${filePath}`);
    }
    return this.analyzeSourceFile(sourceFile);
  }

  async extractSymbols(filePath: string): Promise<CodeSymbol[]> {
    const sourceFile = this.project.getSourceFile(filePath);
    if (!sourceFile) {
      throw new Error(`File not found: ${filePath}`);
    }

    const symbols: CodeSymbol[] = [];

    // Extract classes
    sourceFile.getClasses().forEach(cls => {
      const classInfo = this.extractClassInfo(cls, sourceFile);
      symbols.push(classInfo);
      symbols.push(...classInfo.methods);
      symbols.push(...classInfo.properties);
    });

    // Extract interfaces
    sourceFile.getInterfaces().forEach(iface => {
      symbols.push(this.extractInterfaceInfo(iface, sourceFile));
    });

    // Extract functions
    sourceFile.getFunctions().forEach(func => {
      symbols.push(this.extractFunctionInfo(func, sourceFile));
    });

    // Extract variables and constants
    sourceFile.getVariableDeclarations().forEach(variable => {
      symbols.push(this.extractVariableInfo(variable, sourceFile));
    });

    return symbols;
  }

  private async analyzeSourceFile(sourceFile: SourceFile): Promise<ModuleAST> {
    const filePath = sourceFile.getFilePath();
    const relativePath = path.relative(this.projectPath, filePath);

    // Build AST
    const ast = this.buildASTFromSourceFile(sourceFile);

    // Extract exports
    const exports = this.extractExports(sourceFile);

    // Extract imports
    const imports = this.extractImports(sourceFile);

    // Calculate complexity and LOC
    const complexity = this.calculateFileComplexity(sourceFile);
    const loc = sourceFile.getFullText().split('\n').length;

    return {
      filePath,
      relativePath,
      ast,
      exports,
      imports,
      complexity,
      loc,
    };
  }

  private buildASTFromSourceFile(sourceFile: SourceFile): ASTNode {
    const rootNode: ASTNode = {
      id: this.generateNodeId(sourceFile.getFilePath(), 'module', 1),
      type: 'module',
      name: path.basename(sourceFile.getFilePath()),
      location: this.getSourceLocation(sourceFile, sourceFile),
      children: [],
      metadata: {
        language: 'typescript',
        visibility: 'public',
        isExported: false,
        isAsync: false,
        complexity: 0,
        dependencies: [],
        annotations: [],
      },
    };

    // Process top-level declarations
    sourceFile.forEachChild(node => {
      const astNode = this.convertNodeToAST(node, sourceFile);
      if (astNode) {
        rootNode.children.push(astNode);
      }
    });

    rootNode.metadata.complexity = this.calculateComplexity(rootNode);
    return rootNode;
  }

  private convertNodeToAST(node: Node, sourceFile: SourceFile): ASTNode | null {
    const kind = node.getKind();
    let type: string;
    let name: string;

    switch (kind) {
      case SyntaxKind.ClassDeclaration:
        type = 'class';
        name = (node as any).getName() || 'anonymous';
        break;
      case SyntaxKind.InterfaceDeclaration:
        type = 'interface';
        name = (node as any).getName();
        break;
      case SyntaxKind.FunctionDeclaration:
        type = 'function';
        name = (node as any).getName() || 'anonymous';
        break;
      case SyntaxKind.MethodDeclaration:
        type = 'method';
        name = (node as any).getName();
        break;
      case SyntaxKind.PropertyDeclaration:
        type = 'property';
        name = (node as any).getName();
        break;
      case SyntaxKind.VariableDeclaration:
        type = 'variable';
        name = (node as any).getName();
        break;
      case SyntaxKind.ImportDeclaration:
        type = 'import';
        name = 'import';
        break;
      case SyntaxKind.ExportDeclaration:
        type = 'export';
        name = 'export';
        break;
      default:
        return null; // Skip unsupported node types
    }

    const astNode: ASTNode = {
      id: this.generateNodeId(sourceFile.getFilePath(), name, node.getStartLineNumber()),
      type: type as any,
      name,
      location: this.getSourceLocation(node, sourceFile),
      children: [],
      metadata: {
        language: 'typescript',
        visibility: this.getVisibility(node),
        isExported: this.isExported(node),
        isAsync: this.isAsync(node),
        complexity: 0,
        dependencies: [],
        annotations: this.getDecorators(node),
      },
    };

    // Process children
    node.forEachChild(child => {
      const childAST = this.convertNodeToAST(child, sourceFile);
      if (childAST) {
        astNode.children.push(childAST);
      }
    });

    astNode.metadata.complexity = this.calculateComplexity(astNode);
    return astNode;
  }

  private extractClassInfo(cls: any, sourceFile: SourceFile): ClassInfo {
    const methods: MethodInfo[] = cls
      .getMethods()
      .map((method: any) => this.extractMethodInfo(method, sourceFile));

    const properties: PropertyInfo[] = cls
      .getProperties()
      .map((prop: any) => this.extractPropertyInfo(prop, sourceFile));

    return {
      name: cls.getName(),
      fullyQualifiedName: `${sourceFile.getFilePath()}:${cls.getName()}`,
      type: 'class',
      location: this.getSourceLocation(cls, sourceFile),
      visibility: this.getVisibility(cls),
      isExported: this.isExported(cls),
      signature: cls.getText(),
      decorators: this.getDecorators(cls),
      documentation: this.getDocumentation(cls),
      superClass: cls.getExtends()?.getText(),
      interfaces: cls.getImplements().map((impl: any) => impl.getText()),
      methods,
      properties,
      isAbstract: cls.isAbstract(),
    };
  }

  private extractInterfaceInfo(iface: any, sourceFile: SourceFile): InterfaceInfo {
    const methods: MethodInfo[] = iface
      .getMethods()
      .map((method: any) => this.extractMethodInfo(method, sourceFile));

    const properties: PropertyInfo[] = iface
      .getProperties()
      .map((prop: any) => this.extractPropertyInfo(prop, sourceFile));

    return {
      name: iface.getName(),
      fullyQualifiedName: `${sourceFile.getFilePath()}:${iface.getName()}`,
      type: 'interface',
      location: this.getSourceLocation(iface, sourceFile),
      visibility: 'public',
      isExported: this.isExported(iface),
      signature: iface.getText(),
      documentation: this.getDocumentation(iface),
      extends: iface.getExtends().map((ext: any) => ext.getText()),
      methods,
      properties,
    };
  }

  private extractFunctionInfo(func: any, sourceFile: SourceFile): FunctionInfo {
    return {
      name: func.getName() || 'anonymous',
      fullyQualifiedName: `${sourceFile.getFilePath()}:${func.getName()}`,
      type: 'function',
      location: this.getSourceLocation(func, sourceFile),
      visibility: this.getVisibility(func),
      isExported: this.isExported(func),
      signature: func.getText(),
      returnType: func.getReturnTypeNode()?.getText(),
      parameters: func.getParameters().map((param: any) => ({
        name: param.getName(),
        type: param.getTypeNode()?.getText() || 'any',
        isOptional: param.isOptional(),
        defaultValue: param.getInitializer()?.getText(),
      })),
      documentation: this.getDocumentation(func),
      isAsync: func.isAsync(),
      complexity: this.calculateNodeComplexity(func),
      callsites: [], // Would need more analysis to find callsites
    };
  }

  private extractMethodInfo(method: any, sourceFile: SourceFile): MethodInfo {
    return {
      name: method.getName(),
      fullyQualifiedName: `${sourceFile.getFilePath()}:${method.getName()}`,
      type: 'method',
      location: this.getSourceLocation(method, sourceFile),
      visibility: this.getVisibility(method),
      isExported: false, // Methods are not directly exported
      signature: method.getText(),
      returnType: method.getReturnTypeNode()?.getText(),
      parameters: method.getParameters().map((param: any) => ({
        name: param.getName(),
        type: param.getTypeNode()?.getText() || 'any',
        isOptional: param.isOptional(),
        defaultValue: param.getInitializer()?.getText(),
      })),
      decorators: this.getDecorators(method),
      documentation: this.getDocumentation(method),
      isStatic: method.isStatic(),
      isAbstract: method.isAbstract(),
      isAsync: method.isAsync(),
      complexity: this.calculateNodeComplexity(method),
    };
  }

  private extractPropertyInfo(prop: any, sourceFile: SourceFile): PropertyInfo {
    return {
      name: prop.getName(),
      fullyQualifiedName: `${sourceFile.getFilePath()}:${prop.getName()}`,
      type: 'property',
      location: this.getSourceLocation(prop, sourceFile),
      visibility: this.getVisibility(prop),
      isExported: false, // Properties are not directly exported
      signature: prop.getText(),
      decorators: this.getDecorators(prop),
      documentation: this.getDocumentation(prop),
      isStatic: prop.isStatic(),
      isReadonly: prop.isReadonly(),
      hasGetter: false, // Would need more analysis
      hasSetter: false, // Would need more analysis
    };
  }

  private extractVariableInfo(variable: any, sourceFile: SourceFile): CodeSymbol {
    return {
      name: variable.getName(),
      fullyQualifiedName: `${sourceFile.getFilePath()}:${variable.getName()}`,
      type: 'variable',
      location: this.getSourceLocation(variable, sourceFile),
      visibility: 'public', // Variables are typically public in modules
      isExported: this.isExported(variable.getParent()),
      signature: variable.getText(),
      documentation: this.getDocumentation(variable),
    };
  }

  private extractExports(sourceFile: SourceFile): string[] {
    const exports: string[] = [];

    // Named exports
    sourceFile.getExportDeclarations().forEach(exportDecl => {
      exportDecl.getNamedExports().forEach(namedExport => {
        exports.push(namedExport.getName());
      });
    });

    // Default exports
    sourceFile.getExportAssignments().forEach(exportAssign => {
      if (exportAssign.isExportEquals()) {
        exports.push('default');
      }
    });

    // Exported declarations
    sourceFile.getClasses().forEach(cls => {
      if (cls.isExported()) {
        const name = cls.getName();
        if (name) {
          exports.push(name);
        }
      }
    });

    sourceFile.getFunctions().forEach(func => {
      if (func.isExported()) {
        exports.push(func.getName() || 'anonymous');
      }
    });

    sourceFile.getInterfaces().forEach(iface => {
      if (iface.isExported()) {
        exports.push(iface.getName());
      }
    });

    return exports;
  }

  private extractImports(sourceFile: SourceFile): ImportDeclaration[] {
    const imports: ImportDeclaration[] = [];

    sourceFile.getImportDeclarations().forEach(importDecl => {
      const source = importDecl.getModuleSpecifierValue();
      const importClause = importDecl.getImportClause();

      if (importClause) {
        const namedImports = importClause.getNamedBindings();
        const defaultImport = importClause.getDefaultImport();

        let importNames: string[] = [];
        let isDefault = false;
        let isNamespace = false;

        if (defaultImport) {
          importNames.push(defaultImport.getText());
          isDefault = true;
        }

        if (namedImports) {
          if (Node.isNamespaceImport(namedImports)) {
            importNames.push(namedImports.getName());
            isNamespace = true;
          } else if (Node.isNamedImports(namedImports)) {
            namedImports.getElements().forEach(element => {
              importNames.push(element.getName());
            });
          }
        }

        imports.push({
          source,
          imports: importNames,
          isDefault,
          isNamespace,
          location: this.getSourceLocation(importDecl, sourceFile),
        });
      }
    });

    return imports;
  }

  private calculateFileComplexity(sourceFile: SourceFile): number {
    let complexity = 0;

    sourceFile.forEachDescendant(node => {
      complexity += this.calculateNodeComplexity(node);
    });

    return complexity;
  }

  private calculateNodeComplexity(node: Node): number {
    const kind = node.getKind();

    // Control flow adds complexity
    const complexityKinds = [
      SyntaxKind.IfStatement,
      SyntaxKind.WhileStatement,
      SyntaxKind.ForStatement,
      SyntaxKind.ForInStatement,
      SyntaxKind.ForOfStatement,
      SyntaxKind.SwitchStatement,
      SyntaxKind.CaseClause,
      SyntaxKind.TryStatement,
      SyntaxKind.CatchClause,
      SyntaxKind.ConditionalExpression,
    ];

    return complexityKinds.includes(kind) ? 1 : 0;
  }

  private getSourceLocation(node: Node, sourceFile: SourceFile): SourceLocation {
    const start = sourceFile.getLineAndColumnAtPos(node.getStart());
    const end = sourceFile.getLineAndColumnAtPos(node.getEnd());

    return {
      file: sourceFile.getFilePath(),
      startLine: start.line,
      startColumn: start.column,
      endLine: end.line,
      endColumn: end.column,
    };
  }

  private getVisibility(node: Node): 'public' | 'private' | 'protected' | 'internal' {
    // Simplified visibility detection - in a real implementation we'd need proper type checking
    const text = node.getText();
    if (text.includes('private ')) return 'private';
    if (text.includes('protected ')) return 'protected';
    if (text.includes('public ')) return 'public';
    return 'public'; // Default visibility
  }

  private isExported(node: Node): boolean {
    // Simplified export detection
    const text = node.getText();
    return text.includes('export ');
  }

  private isAsync(node: Node): boolean {
    // Simplified async detection
    const text = node.getText();
    return text.includes('async ');
  }

  private getDecorators(node: Node): string[] {
    // Simplified decorator detection
    const text = node.getText();
    const decoratorMatches = text.match(/@\w+/g);
    return decoratorMatches || [];
  }

  private getDocumentation(node: Node): string | undefined {
    if (Node.isJSDocable(node)) {
      const jsDocs = node.getJsDocs();
      if (jsDocs.length > 0) {
        return jsDocs[0].getDescription();
      }
    }
    return undefined;
  }

  private buildExportMap(modules: ModuleAST[]): any {
    const exportMap: any = {};
    for (const module of modules) {
      exportMap[module.relativePath] = module.exports;
    }
    return exportMap;
  }

  private buildImportMap(modules: ModuleAST[]): any {
    const importMap: any = {};
    for (const module of modules) {
      importMap[module.relativePath] = module.imports;
    }
    return importMap;
  }

  private findTsConfig(projectPath: string): string | undefined {
    const tsConfigPath = path.join(projectPath, 'tsconfig.json');
    if (fs.existsSync(tsConfigPath)) {
      return tsConfigPath;
    }
    return undefined;
  }
}
