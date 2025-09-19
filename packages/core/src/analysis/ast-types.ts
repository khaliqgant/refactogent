// Unified AST representation across languages

export interface ASTNode {
  id: string;
  type: NodeType;
  name: string;
  location: SourceLocation;
  children: ASTNode[];
  metadata: NodeMetadata;
}

export interface SourceLocation {
  file: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface NodeMetadata {
  language: 'typescript' | 'python' | 'go';
  visibility: 'public' | 'private' | 'protected' | 'internal';
  isExported: boolean;
  isAsync: boolean;
  complexity: number;
  dependencies: string[];
  annotations: string[];
  docstring?: string;
}

export type NodeType = 
  | 'module'
  | 'class' 
  | 'interface'
  | 'function'
  | 'method'
  | 'property'
  | 'variable'
  | 'import'
  | 'export'
  | 'type'
  | 'enum'
  | 'namespace'
  | 'decorator'
  | 'comment';

export interface ProjectAST {
  projectPath: string;
  language: string;
  modules: ModuleAST[];
  dependencies: DependencyGraph;
  exports: ExportMap;
  imports: ImportMap;
  metrics: ASTMetrics;
}

export interface ModuleAST {
  filePath: string;
  relativePath: string;
  ast: ASTNode;
  exports: string[];
  imports: ImportDeclaration[];
  complexity: number;
  loc: number; // Lines of code
}

export interface ImportDeclaration {
  source: string;
  imports: string[];
  isDefault: boolean;
  isNamespace: boolean;
  location: SourceLocation;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

export interface DependencyNode {
  id: string;
  name: string;
  type: 'module' | 'function' | 'class' | 'variable';
  filePath: string;
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'imports' | 'calls' | 'extends' | 'implements';
  weight: number;
}

export interface ExportMap {
  [modulePath: string]: string[];
}

export interface ImportMap {
  [modulePath: string]: ImportDeclaration[];
}

export interface ASTMetrics {
  totalNodes: number;
  totalFiles: number;
  averageComplexity: number;
  maxComplexity: number;
  totalLOC: number;
  publicAPICount: number;
  circularDependencies: string[][];
}

export interface SymbolInfo {
  name: string;
  type: string;
  kind: NodeType;
  location: SourceLocation;
  visibility: string;
  isExported: boolean;
  references: SourceLocation[];
  documentation?: string;
}

export interface CodeSymbol {
  name: string;
  fullyQualifiedName: string;
  type: NodeType;
  location: SourceLocation;
  visibility: 'public' | 'private' | 'protected' | 'internal';
  isExported: boolean;
  signature?: string;
  returnType?: string;
  parameters?: Parameter[];
  decorators?: string[];
  documentation?: string;
}

export interface Parameter {
  name: string;
  type: string;
  isOptional: boolean;
  defaultValue?: string;
}

export interface ClassInfo extends CodeSymbol {
  type: 'class';
  superClass?: string;
  interfaces: string[];
  methods: MethodInfo[];
  properties: PropertyInfo[];
  isAbstract: boolean;
}

export interface MethodInfo extends CodeSymbol {
  type: 'method';
  isStatic: boolean;
  isAbstract: boolean;
  isAsync: boolean;
  complexity: number;
}

export interface PropertyInfo extends CodeSymbol {
  type: 'property';
  isStatic: boolean;
  isReadonly: boolean;
  hasGetter: boolean;
  hasSetter: boolean;
}

export interface FunctionInfo extends CodeSymbol {
  type: 'function';
  isAsync: boolean;
  complexity: number;
  callsites: SourceLocation[];
}

export interface InterfaceInfo extends CodeSymbol {
  type: 'interface';
  extends: string[];
  methods: MethodInfo[];
  properties: PropertyInfo[];
}