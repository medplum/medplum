import { Command } from 'commander';
import { medplum } from '.';
import { MedplumClient, LoginState } from '@medplum/core';

export const project = new Command('project');

project
  .command('list')
  .description('List of current projects')
  .action(async () => {
    projectList(medplum);
  });

function projectList(medplum: MedplumClient): void {
  const logins = medplum.getLogins();

  const projects = logins
    .map((login: LoginState) => `${login.project.display} (${login.project.reference})`)
    .join('\n\n');

  console.log(projects);
}

project
  .command('current')
  .description('Project you are currently on')
  .action(async () => {
    const login = medplum.getActiveLogin();
    if (!login) {
        throw new Error('Unauthenticated: run `npx medplum login` to login')
    }
    console.log(`${login.project.display} (${login.project.reference})`);
  });

project
  .command('switch')
  .description('Switching to another project from the current one')
  .argument('<projectId>')
  .action(async (projectId) => {
    switchProject(medplum, projectId);
  });

function switchProject(medplum: MedplumClient, projectId: string): void {
  const logins = medplum.getLogins();
  const login = logins.find((login: LoginState) =>  login.project?.reference?.includes(projectId));
  if (!login) {
    console.log(`Error: project ${projectId} not found. Make sure you are added as a user to this project`);
  } else {
    medplum.setActiveLogin(login);
    console.log(`Switched to project ${projectId}\n`);
  }
}
