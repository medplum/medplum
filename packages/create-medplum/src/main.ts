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
}

const STARTER_PROJECTS: StarterProject[] = [
  {
    id: 'medplum-hello-world',
    name: 'Hello World',
    description: 'Minimal starter application showing basic Medplum integration',
  },
  {
    id: 'foomedical',
    name: 'Foo Medical',
    description: 'Full featured patient portal with open registration',
  },
  {
    id: 'medplum-provider',
    name: 'Provider',
    description: 'Simple EHR application with patient and encounter management',
  },
];

async function prompt(
  terminal: readline.Interface,
  question: string,
  defaultValue: string,
  validationFunc: (str: string) => boolean | string,
  validationMessage: string
): Promise<string> {
  // eslint-disable-next-line no-constant-condition
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
      const num = parseInt(str, 10);
      return num >= 1 && num <= STARTER_PROJECTS.length;
    },
    'Please enter a number between 1 and ' + STARTER_PROJECTS.length
  );
  const starterProject = STARTER_PROJECTS[parseInt(answer, 10) - 1];

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

  // Cleanup
  terminal.close();

  return { starterProject, projectName, serverUrl };
}

async function initializeProject(config: ProjectConfig): Promise<void> {
  const projectDir = path.join(process.cwd(), config.projectName);

  try {
    // Clone the repository
    console.log('Cloning starter project...');
    cp.execSync(`git clone git@github.com:medplum/${config.starterProject.id} ${config.projectName}`, {
      stdio: 'inherit',
    });

    // Remove .git directory
    fs.rmSync(path.join(projectDir, '.git'), { recursive: true, force: true });

    // Update configuration
    const configPath = path.join(projectDir, 'src', 'config.ts');
    if (fs.existsSync(configPath)) {
      let configContent = fs.readFileSync(configPath, 'utf8');
      configContent = configContent.replace(/baseUrl:.*$/m, `baseUrl: '${config.serverUrl}',`);
      fs.writeFileSync(configPath, configContent);
    }

    // Initialize new git repository
    console.log('Initializing new git repository...');
    cp.execSync('git init', { cwd: projectDir, stdio: 'inherit' });
    cp.execSync('git add .', { cwd: projectDir, stdio: 'inherit' });
    cp.execSync('git commit -m "Initial commit from Medplum initializer"', {
      cwd: projectDir,
      stdio: 'inherit',
    });

    // Install dependencies
    console.log('Installing dependencies...');
    cp.execSync('npm install', { cwd: projectDir, stdio: 'inherit' });

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
