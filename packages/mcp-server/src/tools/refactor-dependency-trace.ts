import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import * as path from "path";
import { Project } from "ts-morph";
import {
  RefactorDependencyTraceSchema,
  RefactorDependencyTraceOutput,
  DependencyChain,
  CircularDependency,
} from "../types/index.js";

export class RefactorDependencyTraceTool {
  private project?: Project;

  async execute(args: unknown) {
    const validated = RefactorDependencyTraceSchema.parse(args);
    const { targetFile, direction, maxDepth, includeUnused } = validated;

    try {
      console.error(`[refactor_dependency_trace] Tracing dependencies for: ${targetFile}`);

      // Resolve absolute path
      const absolutePath = path.resolve(process.cwd(), targetFile);
      if (!existsSync(absolutePath)) {
        throw new Error(`File not found: ${targetFile}`);
      }

      // Initialize ts-morph project
      this.project = new Project({
        tsConfigFilePath: this.findTsConfig(),
        skipAddingFilesFromTsConfig: false,
      });

      const sourceFile = this.project.getSourceFile(absolutePath);
      if (!sourceFile) {
        throw new Error(`Could not load source file: ${targetFile}`);
      }

      let forwardDeps: DependencyChain[] = [];
      let backwardDeps: DependencyChain[] = [];

      // Forward dependencies (what this file imports)
      if (direction === "forward" || direction === "both") {
        forwardDeps = this.traceForwardDependencies(sourceFile.getFilePath(), maxDepth ?? 3);
      }

      // Backward dependencies (what imports this file)
      if (direction === "backward" || direction === "both") {
        backwardDeps = this.traceBackwardDependencies(sourceFile.getFilePath(), maxDepth ?? 3);
      }

      // Detect circular dependencies
      const circularDeps = this.detectCircularDependencies(sourceFile.getFilePath());

      // Find unused imports/exports
      let unusedImports: string[] = [];
      let unusedExports: string[] = [];
      if (includeUnused) {
        unusedImports = this.findUnusedImports(sourceFile);
        unusedExports = this.findUnusedExports(sourceFile);
      }

      // Calculate total files affected
      const allDeps = new Set([
        ...forwardDeps.flatMap((d) => d.path),
        ...backwardDeps.flatMap((d) => d.path),
      ]);

      const output: RefactorDependencyTraceOutput = {
        targetFile,
        direction: direction ?? "both",
        forwardDependencies: forwardDeps,
        backwardDependencies: backwardDeps,
        totalFilesAffected: allDeps.size,
        circularDependencies: circularDeps,
        unusedImports: includeUnused ? unusedImports : undefined,
        unusedExports: includeUnused ? unusedExports : undefined,
        summary: this.generateSummary(forwardDeps, backwardDeps, circularDeps),
      };

      console.error(
        `[refactor_dependency_trace] Found ${allDeps.size} affected files, ${circularDeps.length} circular dependencies`
      );

      return {
        content: [
          {
            type: "text",
            text: this.formatOutput(output),
          },
        ],
      };
    } catch (error) {
      console.error("[refactor_dependency_trace] Error:", error);
      throw error;
    }
  }

  private findTsConfig(): string | undefined {
    const cwd = process.cwd();
    const candidates = [
      path.join(cwd, "tsconfig.json"),
      path.join(cwd, "tsconfig.base.json"),
      path.join(cwd, "packages/*/tsconfig.json"),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return undefined;
  }

  private traceForwardDependencies(filePath: string, maxDepth: number): DependencyChain[] {
    const chains: DependencyChain[] = [];
    const visited = new Set<string>();

    const trace = (currentPath: string, depth: number, chain: string[]) => {
      if (depth > maxDepth || visited.has(currentPath)) {
        return;
      }

      visited.add(currentPath);
      const sourceFile = this.project?.getSourceFile(currentPath);
      if (!sourceFile) return;

      const imports = sourceFile.getImportDeclarations();
      for (const imp of imports) {
        const moduleSpecifier = imp.getModuleSpecifierValue();

        // Skip node_modules
        if (moduleSpecifier.startsWith(".") || moduleSpecifier.startsWith("/")) {
          const resolvedPath = this.resolveImport(currentPath, moduleSpecifier);
          if (resolvedPath) {
            const importedSymbols = imp.getNamedImports().map((ni) => ni.getName());
            const newChain = [...chain, resolvedPath];

            chains.push({
              path: newChain,
              symbols: importedSymbols,
              depth: depth + 1,
            });

            trace(resolvedPath, depth + 1, newChain);
          }
        }
      }
    };

    trace(filePath, 0, [filePath]);
    return chains;
  }

  private traceBackwardDependencies(filePath: string, maxDepth: number): DependencyChain[] {
    const chains: DependencyChain[] = [];
    const visited = new Set<string>();

    const trace = (currentPath: string, depth: number, chain: string[]) => {
      if (depth > maxDepth || visited.has(currentPath)) {
        return;
      }

      visited.add(currentPath);
      const referencingFiles = this.findFilesImporting(currentPath);

      for (const refFile of referencingFiles) {
        const newChain = [...chain, refFile];
        chains.push({
          path: newChain,
          symbols: [],
          depth: depth + 1,
        });

        trace(refFile, depth + 1, newChain);
      }
    };

    trace(filePath, 0, [filePath]);
    return chains;
  }

  private findFilesImporting(targetPath: string): string[] {
    const importingFiles: string[] = [];

    if (!this.project) return importingFiles;

    for (const sourceFile of this.project.getSourceFiles()) {
      const imports = sourceFile.getImportDeclarations();
      for (const imp of imports) {
        const moduleSpecifier = imp.getModuleSpecifierValue();
        const resolvedPath = this.resolveImport(sourceFile.getFilePath(), moduleSpecifier);

        if (resolvedPath === targetPath) {
          importingFiles.push(sourceFile.getFilePath());
          break;
        }
      }
    }

    return importingFiles;
  }

  private detectCircularDependencies(startPath: string): CircularDependency[] {
    const circular: CircularDependency[] = [];
    const stack: string[] = [];
    const visited = new Set<string>();

    const detectCycle = (currentPath: string) => {
      if (stack.includes(currentPath)) {
        // Found a cycle
        const cycleStart = stack.indexOf(currentPath);
        const cycle = stack.slice(cycleStart);
        circular.push({
          files: [...cycle, currentPath],
          severity: cycle.length > 3 ? "high" : "medium",
        });
        return;
      }

      if (visited.has(currentPath)) return;

      visited.add(currentPath);
      stack.push(currentPath);

      const sourceFile = this.project?.getSourceFile(currentPath);
      if (sourceFile) {
        const imports = sourceFile.getImportDeclarations();
        for (const imp of imports) {
          const moduleSpecifier = imp.getModuleSpecifierValue();
          if (moduleSpecifier.startsWith(".") || moduleSpecifier.startsWith("/")) {
            const resolvedPath = this.resolveImport(currentPath, moduleSpecifier);
            if (resolvedPath) {
              detectCycle(resolvedPath);
            }
          }
        }
      }

      stack.pop();
    };

    detectCycle(startPath);
    return circular;
  }

  private findUnusedImports(sourceFile: any): string[] {
    const unused: string[] = [];

    try {
      const imports = sourceFile.getImportDeclarations();
      for (const imp of imports) {
        const namedImports = imp.getNamedImports();
        for (const namedImport of namedImports) {
          const name = namedImport.getName();
          const references = namedImport.findReferencesAsNodes();

          // If only 1 reference (the import itself), it's unused
          if (references.length <= 1) {
            unused.push(`${name} from ${imp.getModuleSpecifierValue()}`);
          }
        }
      }
    } catch (error) {
      console.warn("Error finding unused imports:", error);
    }

    return unused;
  }

  private findUnusedExports(sourceFile: any): string[] {
    const unused: string[] = [];

    try {
      const exports = sourceFile.getExportedDeclarations();
      for (const [name, declarations] of exports) {
        for (const decl of declarations) {
          const references = decl.findReferencesAsNodes();

          // If only referenced in the same file, might be unused
          const externalRefs = references.filter(
            (ref: any) => ref.getSourceFile().getFilePath() !== sourceFile.getFilePath()
          );

          if (externalRefs.length === 0) {
            unused.push(name);
          }
        }
      }
    } catch (error) {
      console.warn("Error finding unused exports:", error);
    }

    return unused;
  }

  private resolveImport(fromPath: string, importSpecifier: string): string | null {
    try {
      const dir = path.dirname(fromPath);
      let resolved = path.resolve(dir, importSpecifier);

      // Try different extensions
      const extensions = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.js"];
      for (const ext of extensions) {
        const candidate = resolved + ext;
        if (existsSync(candidate)) {
          return candidate;
        }
      }

      // Try exact path
      if (existsSync(resolved)) {
        return resolved;
      }

      return null;
    } catch {
      return null;
    }
  }

  private generateSummary(
    forward: DependencyChain[],
    backward: DependencyChain[],
    circular: CircularDependency[]
  ): string {
    const forwardCount = new Set(forward.flatMap((d) => d.path)).size;
    const backwardCount = new Set(backward.flatMap((d) => d.path)).size;

    let summary = `This file has ${forwardCount} forward dependencies and ${backwardCount} backward dependencies.`;

    if (circular.length > 0) {
      summary += ` ⚠️ Found ${circular.length} circular dependency pattern(s).`;
    }

    if (backwardCount > 10) {
      summary += ` This file is heavily depended upon - refactor with caution.`;
    }

    return summary;
  }

  private formatOutput(output: RefactorDependencyTraceOutput): string {
    const {
      targetFile,
      direction,
      forwardDependencies,
      backwardDependencies,
      totalFilesAffected,
      circularDependencies,
      unusedImports,
      unusedExports,
      summary,
    } = output;

    let result = `# Dependency Trace: ${path.basename(targetFile)}

**Direction**: ${direction}
**Total Files Affected**: ${totalFilesAffected}

${summary}

`;

    if (forwardDependencies.length > 0) {
      result += `## Forward Dependencies (What This File Imports)

`;
      const uniqueForward = this.deduplicateChains(forwardDependencies);
      for (const chain of uniqueForward.slice(0, 15)) {
        const indent = "  ".repeat(chain.depth);
        const fileName = path.basename(chain.path[chain.path.length - 1]);
        const symbols = chain.symbols.length > 0 ? ` (${chain.symbols.join(", ")})` : "";
        result += `${indent}- ${fileName}${symbols}\n`;
      }
      if (uniqueForward.length > 15) {
        result += `\n_... and ${uniqueForward.length - 15} more_\n`;
      }
      result += "\n";
    }

    if (backwardDependencies.length > 0) {
      result += `## Backward Dependencies (What Imports This File)

`;
      const uniqueBackward = this.deduplicateChains(backwardDependencies);
      for (const chain of uniqueBackward.slice(0, 15)) {
        const indent = "  ".repeat(chain.depth);
        const fileName = path.basename(chain.path[chain.path.length - 1]);
        result += `${indent}- ${fileName}\n`;
      }
      if (uniqueBackward.length > 15) {
        result += `\n_... and ${uniqueBackward.length - 15} more_\n`;
      }
      result += "\n";
    }

    if (circularDependencies.length > 0) {
      result += `## ⚠️ Circular Dependencies Found

`;
      for (const circ of circularDependencies) {
        const fileNames = circ.files.map((f) => path.basename(f)).join(" → ");
        result += `- **[${circ.severity}]** ${fileNames}\n`;
      }
      result += "\n";
    }

    if (unusedImports && unusedImports.length > 0) {
      result += `## Unused Imports

`;
      for (const unused of unusedImports.slice(0, 10)) {
        result += `- ${unused}\n`;
      }
      result += "\n";
    }

    if (unusedExports && unusedExports.length > 0) {
      result += `## Unused Exports

`;
      for (const unused of unusedExports.slice(0, 10)) {
        result += `- ${unused}\n`;
      }
      result += "\n";
    }

    return result;
  }

  private deduplicateChains(chains: DependencyChain[]): DependencyChain[] {
    const seen = new Set<string>();
    const unique: DependencyChain[] = [];

    for (const chain of chains) {
      const key = chain.path.join("|");
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(chain);
      }
    }

    return unique;
  }
}
