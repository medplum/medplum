#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

interface StarterProject {
  id: string;
  name: string;
  description: string;
}

interface ProjectConfig {
  starterProject: StarterProject;
  projectName: string;
  serverUrl: string;
  createRemote: boolean;
  remoteVisibility: 'private' | 'public';
}

const STARTER_PROJECTS: StarterProject[] = [
  {
    id: 'medplum-provider',
    name: 'Provider',
    description: 'Simple EHR application with patient and encounter management',
  },
  {
    id: 'foomedical',
    name: 'Foo Medical',
    description: 'Full featured patient portal with open registration',
  },
  {
    id: 'medplum-hello-world',
    name: 'Hello World',
    description: 'Minimal starter application showing basic Medplum integration',
  },
];

async function prompt(
  terminal: readline.Interface,
  question: string,
  defaultValue: string,
  validationFunc: (str: string) => boolean | string,
  validationMessage: string
): Promise<string> {
  while (true) {
    const defaultPrompt = defaultValue ? ` (${defaultValue})` : '';
    const answer = (await terminal.question(`${question}${defaultPrompt}: `)) || defaultValue;
    if (validationFunc(answer)) {
      return answer;
    }
    console.log(validationMessage);
  }
}

async function promptForConfig(): Promise<ProjectConfig> {
  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Display the list of starter projects
  console.log('Which starter project would you like to use?');
  for (let i = 0; i < STARTER_PROJECTS.length; i++) {
    console.log(`${i + 1}) ${STARTER_PROJECTS[i].name} - ${STARTER_PROJECTS[i].description}`);
  }

  // Prompt the user to select a project
  const answer = await prompt(
    terminal,
    'Enter number',
    '1',
    (str) => {
      const num = Number.parseInt(str, 10);
      return num >= 1 && num <= STARTER_PROJECTS.length;
    },
    'Please enter a number between 1 and ' + STARTER_PROJECTS.length
  );
  const starterProject = STARTER_PROJECTS[Number.parseInt(answer, 10) - 1];

  // Prompt the user for the project name
  const projectName = await prompt(
    terminal,
    'What is your project name?',
    starterProject.id,
    (name) => name && /^[a-zA-Z0-9-_]+$/.test(name),
    'Project name may only include letters, numbers, dashes, and underscores'
  );

  // Prompt the user for the server URL
  const serverUrl = await prompt(
    terminal,
    'What is your Medplum server URL?',
    'https://api.medplum.com/',
    (url) => URL.canParse(url),
    'Please enter a valid URL'
  );

  // Prompt the user to create and push to a new GitHub repository
  const createRemoteAnswer = await prompt(
    terminal,
    'Create a new GitHub repository and push it there? (requires the GitHub CLI `gh`) (y/N)',
    'n',
    (str) => /^(y|n|yes|no)$/i.test(str),
    'Please enter y or n'
  );
  const createRemote = /^y/i.test(createRemoteAnswer);

  // Only ask about visibility if we are actually creating a repository
  let remoteVisibility: ProjectConfig['remoteVisibility'] = 'private';
  if (createRemote) {
    const visibilityAnswer = await prompt(
      terminal,
      'Repository visibility',
      'private',
      (str) => /^(private|public)$/i.test(str),
      'Please enter "private" or "public"'
    );
    remoteVisibility = visibilityAnswer.toLowerCase() as ProjectConfig['remoteVisibility'];
  }

  // Cleanup
  terminal.close();

  return { starterProject, projectName, serverUrl, createRemote, remoteVisibility };
}

// Fixed, unwriteable directories we trust to hold developer tools (git, gh, npm).
// We resolve executables against this list and pin the child-process PATH to it,
// so the tools never rely on PATH resolution and a writable directory injected
// into the ambient PATH cannot shadow them (CWE-426 / CWE-427, SonarCloud S4036).
function trustedBinDirs(): string[] {
  // The directory of the running Node runtime, where npm/npx are installed.
  const dirs = [path.dirname(process.execPath)];
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
    const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
    dirs.push(
      path.join(systemRoot, 'System32'),
      systemRoot,
      path.join(programFiles, 'Git', 'cmd'),
      path.join(programFiles, 'GitHub CLI')
    );
  } else {
    dirs.push('/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin');
  }
  return dirs;
}

// Resolves a command to its absolute path using only the trusted directories.
// Throws if the command is not found, which callers use to detect missing tools.
function resolveExecutable(command: string): string {
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of trustedBinDirs()) {
    for (const extension of extensions) {
      const candidate = path.join(dir, command + extension);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  throw new Error(`Could not find "${command}" in a trusted directory. Please ensure it is installed.`);
}

// Runs a trusted tool by its resolved absolute path, with the child-process PATH
// pinned to the trusted directories so no lookup ever hits the ambient PATH.
function runTool(command: string, args: string, options: { cwd?: string } = {}): void {
  const executable = resolveExecutable(command);
  cp.execSync(`"${executable}" ${args}`, {
    cwd: options.cwd,
    stdio: 'inherit',
    env: { ...process.env, PATH: trustedBinDirs().join(path.delimiter) },
  });
}

// Writes the selected Medplum server URL into the project's `.env` file.
// All Medplum starter apps read the base URL from `import.meta.env.MEDPLUM_BASE_URL`,
// seeded from `.env.defaults`, so we start from that template and override the URL.
function configureEnv(projectDir: string, serverUrl: string): void {
  const envDefaultsPath = path.join(projectDir, '.env.defaults');
  const envPath = path.join(projectDir, '.env');
  let contents = fs.existsSync(envDefaultsPath) ? fs.readFileSync(envDefaultsPath, 'utf8') : '';
  if (/^MEDPLUM_BASE_URL=.*$/m.test(contents)) {
    contents = contents.replace(/^MEDPLUM_BASE_URL=.*$/m, `MEDPLUM_BASE_URL=${serverUrl}`);
  } else {
    contents = `MEDPLUM_BASE_URL=${serverUrl}\n${contents}`;
  }
  fs.writeFileSync(envPath, contents);
}

// Creates a new GitHub repository from the freshly initialized project and pushes to it.
// Uses the GitHub CLI (`gh`), which handles auth against the user's own account.
// If `gh` is unavailable, prints the manual command instead of failing.
function createGitHubRepo(projectDir: string, name: string, visibility: ProjectConfig['remoteVisibility']): void {
  try {
    resolveExecutable('gh');
  } catch {
    console.log('GitHub CLI (`gh`) was not found, so no remote repository was created.');
    console.log('Install it from https://cli.github.com/, then run from the project directory:');
    console.log(`  gh repo create ${name} --${visibility} --source=. --remote=origin --push`);
    return;
  }

  console.log(`Creating ${visibility} GitHub repository and pushing...`);
  runTool('gh', `repo create ${name} --${visibility} --source=. --remote=origin --push`, { cwd: projectDir });
}

async function initializeProject(config: ProjectConfig): Promise<void> {
  const projectDir = path.join(process.cwd(), config.projectName);

  try {
    // Clone the repository over HTTPS so no SSH key setup is required
    console.log('Cloning starter project...');
    runTool('git', `clone https://github.com/medplum/${config.starterProject.id}.git ${config.projectName}`);

    // Remove .git directory
    fs.rmSync(path.join(projectDir, '.git'), { recursive: true, force: true });

    // Point the app at the chosen Medplum server
    configureEnv(projectDir, config.serverUrl);

    // Initialize new git repository
    console.log('Initializing new git repository...');
    runTool('git', 'init', { cwd: projectDir });
    runTool('git', 'add .', { cwd: projectDir });
    runTool('git', 'commit -m "Initial commit from Medplum initializer"', { cwd: projectDir });

    // Optionally create a standalone GitHub repository the user owns and push to it
    if (config.createRemote) {
      createGitHubRepo(projectDir, config.projectName, config.remoteVisibility);
    }

    // Install dependencies
    console.log('Installing dependencies...');
    runTool('npm', 'install', { cwd: projectDir });

    console.log(`Successfully created project ${config.projectName}!`);
    console.log(`Next steps:`);
    console.log(`  cd ${config.projectName}`);
    console.log('  npm run dev');
  } catch (error) {
    console.error('Error initializing project:', error);
    // Clean up on failure
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
    throw error;
  }
}

export async function main(): Promise<void> {
  console.log('Welcome to Medplum project initializer!');
  const config = await promptForConfig();
  await initializeProject(config);
}

if (process.env.NODE_ENV !== 'test') {
  main().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}
