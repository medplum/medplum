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
