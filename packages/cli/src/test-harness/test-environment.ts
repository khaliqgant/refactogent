import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { Logger } from '../utils/logger.js';
import { ProjectType } from '../types/index.js';

export interface TestEnvironmentConfig {
  projectPath: string;
  projectType: ProjectType;
  isolationMode: 'docker' | 'local' | 'sandbox';
  timeout: number;
  resources: {
    memory: string;
    cpu: string;
  };
}

export interface TestEnvironmentState {
  id: string;
  projectPath: string;
  snapshotPath: string;
  timestamp: Date;
  files: Map<string, string>; // filepath -> content hash
  dependencies: Map<string, string>; // package -> version
  buildArtifacts: string[];
}

export interface TestResult {
  success: boolean;
  duration: number;
  output: string;
  error?: string;
  exitCode: number;
  artifacts: string[];
}

export class TestEnvironment {
  private logger: Logger;
  private config: TestEnvironmentConfig;
  private containerId?: string;
  private workingDir: string;

  constructor(config: TestEnvironmentConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.workingDir = path.join(
      process.cwd(),
      '.refactogent',
      'test-environments',
      this.generateId()
    );
  }

  private generateId(): string {
    return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Initialize the test environment
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing test environment', {
      projectType: this.config.projectType,
      isolationMode: this.config.isolationMode,
      workingDir: this.workingDir,
    });

    // Create working directory
    if (!fs.existsSync(this.workingDir)) {
      fs.mkdirSync(this.workingDir, { recursive: true });
    }

    // Copy project files
    await this.copyProjectFiles();

    // Set up isolation environment
    switch (this.config.isolationMode) {
      case 'docker':
        await this.setupDockerEnvironment();
        break;
      case 'sandbox':
        await this.setupSandboxEnvironment();
        break;
      case 'local':
        await this.setupLocalEnvironment();
        break;
    }
  }

  /**
   * Capture current state of the project
   */
  async captureState(): Promise<TestEnvironmentState> {
    this.logger.debug('Capturing project state');

    const state: TestEnvironmentState = {
      id: this.generateId(),
      projectPath: this.config.projectPath,
      snapshotPath: path.join(this.workingDir, 'snapshots', `state-${Date.now()}.json`),
      timestamp: new Date(),
      files: new Map(),
      dependencies: new Map(),
      buildArtifacts: [],
    };

    // Capture file hashes
    await this.captureFileHashes(this.workingDir, state.files);

    // Capture dependencies
    await this.captureDependencies(state.dependencies);

    // Capture build artifacts
    state.buildArtifacts = await this.captureBuildArtifacts();

    // Save state to disk
    const snapshotDir = path.dirname(state.snapshotPath);
    if (!fs.existsSync(snapshotDir)) {
      fs.mkdirSync(snapshotDir, { recursive: true });
    }

    fs.writeFileSync(
      state.snapshotPath,
      JSON.stringify(
        {
          ...state,
          files: Array.from(state.files.entries()),
          dependencies: Array.from(state.dependencies.entries()),
        },
        null,
        2
      )
    );

    return state;
  }

  /**
   * Compare two project states
   */
  compareStates(
    before: TestEnvironmentState,
    after: TestEnvironmentState
  ): {
    filesChanged: string[];
    filesAdded: string[];
    filesRemoved: string[];
    dependenciesChanged: string[];
    buildArtifactsChanged: string[];
  } {
    const result = {
      filesChanged: [] as string[],
      filesAdded: [] as string[],
      filesRemoved: [] as string[],
      dependenciesChanged: [] as string[],
      buildArtifactsChanged: [] as string[],
    };

    // Compare files
    for (const [filepath, hash] of after.files) {
      if (!before.files.has(filepath)) {
        result.filesAdded.push(filepath);
      } else if (before.files.get(filepath) !== hash) {
        result.filesChanged.push(filepath);
      }
    }

    for (const filepath of before.files.keys()) {
      if (!after.files.has(filepath)) {
        result.filesRemoved.push(filepath);
      }
    }

    // Compare dependencies
    for (const [pkg, version] of after.dependencies) {
      if (!before.dependencies.has(pkg) || before.dependencies.get(pkg) !== version) {
        result.dependenciesChanged.push(`${pkg}@${version}`);
      }
    }

    // Compare build artifacts
    const beforeArtifacts = new Set(before.buildArtifacts);
    const afterArtifacts = new Set(after.buildArtifacts);

    for (const artifact of afterArtifacts) {
      if (!beforeArtifacts.has(artifact)) {
        result.buildArtifactsChanged.push(artifact);
      }
    }

    return result;
  }

  /**
   * Execute a command in the test environment
   */
  async executeCommand(command: string, args: string[] = []): Promise<TestResult> {
    this.logger.debug('Executing command in test environment', { command, args });

    const startTime = Date.now();
    let output = '';
    let error = '';

    return new Promise(resolve => {
      const process = this.spawnCommand(command, args);

      process.stdout?.on('data', data => {
        output += data.toString();
      });

      process.stderr?.on('data', data => {
        error += data.toString();
      });

      process.on('close', code => {
        const duration = Date.now() - startTime;

        resolve({
          success: code === 0,
          duration,
          output,
          error: error || undefined,
          exitCode: code || 0,
          artifacts: [], // TODO: Collect artifacts based on command
        });
      });

      // Set timeout
      setTimeout(() => {
        process.kill('SIGTERM');
        resolve({
          success: false,
          duration: Date.now() - startTime,
          output,
          error: 'Command timed out',
          exitCode: -1,
          artifacts: [],
        });
      }, this.config.timeout);
    });
  }

  /**
   * Clean up the test environment
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up test environment', { workingDir: this.workingDir });

    try {
      // Stop and remove Docker container if running
      if (this.containerId) {
        await this.executeCommand('docker', ['stop', this.containerId]);
        await this.executeCommand('docker', ['rm', this.containerId]);
      }

      // Remove working directory
      if (fs.existsSync(this.workingDir)) {
        fs.rmSync(this.workingDir, { recursive: true, force: true });
      }
    } catch (error) {
      this.logger.error('Error during cleanup', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async copyProjectFiles(): Promise<void> {
    // Simple recursive copy - in production, we'd want more sophisticated copying
    // that respects .gitignore, handles symlinks, etc.
    const copyRecursive = (src: string, dest: string) => {
      if (!fs.existsSync(src)) return;

      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
        }
        const files = fs.readdirSync(src);
        for (const file of files) {
          // Skip common directories that shouldn't be copied
          if (['node_modules', '.git', 'dist', 'build', '__pycache__'].includes(file)) {
            continue;
          }
          copyRecursive(path.join(src, file), path.join(dest, file));
        }
      } else {
        fs.copyFileSync(src, dest);
      }
    };

    copyRecursive(this.config.projectPath, this.workingDir);
  }

  private async setupDockerEnvironment(): Promise<void> {
    // Create Dockerfile based on project type
    const dockerfile = this.generateDockerfile();
    fs.writeFileSync(path.join(this.workingDir, 'Dockerfile'), dockerfile);

    // Build Docker image
    const buildResult = await this.executeCommand('docker', [
      'build',
      '-t',
      `refactogent-test-${this.generateId()}`,
      '.',
    ]);

    if (!buildResult.success) {
      throw new Error(`Failed to build Docker image: ${buildResult.error}`);
    }

    // Run container
    const runResult = await this.executeCommand('docker', [
      'run',
      '-d',
      '--name',
      `refactogent-test-${this.generateId()}`,
      '--memory',
      this.config.resources.memory,
      '--cpus',
      this.config.resources.cpu,
      `refactogent-test-${this.generateId()}`,
    ]);

    if (!runResult.success) {
      throw new Error(`Failed to run Docker container: ${runResult.error}`);
    }

    this.containerId = runResult.output.trim();
  }

  private async setupSandboxEnvironment(): Promise<void> {
    // For now, sandbox mode is similar to local but with restricted permissions
    // In a full implementation, we'd use chroot, namespaces, or similar
    await this.setupLocalEnvironment();
  }

  private async setupLocalEnvironment(): Promise<void> {
    // Install dependencies based on project type
    switch (this.config.projectType) {
      case 'typescript':
        if (fs.existsSync(path.join(this.workingDir, 'package.json'))) {
          await this.executeCommand('npm', ['install']);
        }
        break;
      case 'python':
        if (fs.existsSync(path.join(this.workingDir, 'requirements.txt'))) {
          await this.executeCommand('pip', ['install', '-r', 'requirements.txt']);
        }
        break;
      case 'go':
        if (fs.existsSync(path.join(this.workingDir, 'go.mod'))) {
          await this.executeCommand('go', ['mod', 'download']);
        }
        break;
    }
  }

  private generateDockerfile(): string {
    switch (this.config.projectType) {
      case 'typescript':
        return `
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build || true
CMD ["npm", "test"]
`;
      case 'python':
        return `
FROM python:3.11-alpine
WORKDIR /app
COPY requirements.txt ./
RUN pip install -r requirements.txt
COPY . .
CMD ["python", "-m", "pytest"]
`;
      case 'go':
        return `
FROM golang:1.21-alpine
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o main .
CMD ["go", "test", "./..."]
`;
      default:
        return `
FROM alpine:latest
WORKDIR /app
COPY . .
CMD ["echo", "No specific environment configured"]
`;
    }
  }

  private async captureFileHashes(dir: string, hashes: Map<string, string>): Promise<void> {
    const crypto = await import('crypto');

    const processDirectory = (currentDir: string) => {
      const files = fs.readdirSync(currentDir);

      for (const file of files) {
        const fullPath = path.join(currentDir, file);
        const relativePath = path.relative(this.workingDir, fullPath);

        if (fs.statSync(fullPath).isDirectory()) {
          // Skip certain directories
          if (['node_modules', '.git', 'dist', 'build', '__pycache__'].includes(file)) {
            continue;
          }
          processDirectory(fullPath);
        } else {
          const content = fs.readFileSync(fullPath);
          const hash = crypto.createHash('sha256').update(content).digest('hex');
          hashes.set(relativePath, hash);
        }
      }
    };

    processDirectory(dir);
  }

  private async captureDependencies(dependencies: Map<string, string>): Promise<void> {
    switch (this.config.projectType) {
      case 'typescript':
        const packageJsonPath = path.join(this.workingDir, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
          for (const [pkg, version] of Object.entries(deps)) {
            dependencies.set(pkg, version as string);
          }
        }
        break;
      case 'python':
        const requirementsPath = path.join(this.workingDir, 'requirements.txt');
        if (fs.existsSync(requirementsPath)) {
          const requirements = fs.readFileSync(requirementsPath, 'utf8');
          for (const line of requirements.split('\n')) {
            const match = line.trim().match(/^([^=<>!]+)[=<>!]/);
            if (match) {
              dependencies.set(match[1], line.trim());
            }
          }
        }
        break;
      case 'go':
        const goModPath = path.join(this.workingDir, 'go.mod');
        if (fs.existsSync(goModPath)) {
          const goMod = fs.readFileSync(goModPath, 'utf8');
          const requireRegex = /require\s+([^\s]+)\s+([^\s]+)/g;
          let match;
          while ((match = requireRegex.exec(goMod)) !== null) {
            dependencies.set(match[1], match[2]);
          }
        }
        break;
    }
  }

  private async captureBuildArtifacts(): Promise<string[]> {
    const artifacts: string[] = [];

    const artifactDirs = ['dist', 'build', 'target', '__pycache__'];

    for (const dir of artifactDirs) {
      const artifactPath = path.join(this.workingDir, dir);
      if (fs.existsSync(artifactPath)) {
        artifacts.push(dir);
      }
    }

    return artifacts;
  }

  private spawnCommand(command: string, args: string[], options: any = {}): ChildProcess {
    const spawnOptions = {
      cwd: this.workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    };

    if (this.config.isolationMode === 'docker' && this.containerId) {
      return spawn('docker', ['exec', this.containerId, command, ...args], spawnOptions);
    } else {
      return spawn(command, args, spawnOptions);
    }
  }
}
