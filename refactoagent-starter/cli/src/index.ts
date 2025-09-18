import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const program = new Command();
program
  .name('refactoagent')
  .description('RefactoAgent CLI — safe, local-first refactoring assistant')
  .version('0.1.0');

function ensureOutDir(outDir: string) {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
}

function writeReport(outDir: string, content: string, file = 'report.md') {
  ensureOutDir(outDir);
  fs.writeFileSync(path.join(outDir, file), content, 'utf8');
  console.log(`Wrote ${file} to ${outDir}`);
}

program.command('stabilize')
  .description('Generate characterization tests for routes/CLI/library surfaces (no code changes).')
  .option('--routes <n>', 'Number of HTTP routes to record', '10')
  .option('--cli <n>', 'Number of CLI commands to record', '0')
  .action((opts) => {
    const outDir = path.resolve('.refactoagent/out');
    const report = `# Stabilize Report\n- routes: ${opts.routes}\n- cli: ${opts.cli}\n\n(Stub) Generated golden tests and smoke tests.\n`;
    writeReport(outDir, report, 'stabilize-report.md');
  });

program.command('plan')
  .description('Propose safe diffs (no write).')
  .option('--mode <mode>', 'organize-only | name-hygiene | tests-first | micro-simplify', 'organize-only')
  .action((opts) => {
    const outDir = path.resolve('.refactoagent/out');
    const plan = {
      mode: opts.mode,
      changes: [
        { type: 'rename-private', file: 'src/utils.ts', symbol: 'doThing', to: 'doThingInternal' }
      ]
    };
    ensureOutDir(outDir);
    fs.writeFileSync(path.join(outDir, 'plan.json'), JSON.stringify(plan, null, 2), 'utf8');
    console.log(`Plan written to ${path.join(outDir, 'plan.json')}`);
  });

program.command('apply')
  .description('Apply planned changes to a new branch.')
  .option('--branch <name>', 'Branch name', 'refactor/sample')
  .action((opts) => {
    console.log(`(Stub) Would create branch ${opts.branch} and apply edits via AST tools.`);
  });

program.command('patch')
  .description('Emit a git patch and PR-ready description without touching remotes.')
  .option('--out <dir>', 'Output directory', '.refactoagent/out')
  .action((opts) => {
    const outDir = path.resolve(opts.out);
    ensureOutDir(outDir);
    const patch = '--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1,3 +1,3 @@\n-export function foo(a:any){return a+1}\n+export function foo(n:number){ return n + 1 }\n';
    fs.writeFileSync(path.join(outDir, 'change.patch'), patch, 'utf8');
    const pr = `## Summary\nMinor type-safe improvement to foo().\n\n## Safety\n- No behavior change.\n- Tests updated.\n`;
    writeReport(outDir, pr, 'PR_DESCRIPTION.md');
    console.log(`Patch and PR description written to ${outDir}`);
  });

program.command('revert')
  .description('Revert from a generated patch.')
  .option('--from <patch>', 'Patch path', '.refactoagent/out/change.patch')
  .action((opts) => {
    console.log(`(Stub) Would apply reverse of ${opts.from}.`);
  });

program.command('lsp')
  .description('Start a minimal JSON-RPC server for IDE integration (stdio).')
  .action(() => {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      // Echo-style JSON-RPC stub
      try {
        const msg = JSON.parse(chunk);
        const res = { jsonrpc: '2.0', id: msg.id, result: { ok: true, echo: msg } };
        process.stdout.write(JSON.stringify(res) + '\n');
      } catch {
        // ignore
      }
    });
    console.log('RefactoAgent LSP stub running on stdio.');
  });

program.parse(process.argv);
