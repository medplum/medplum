import { Command } from 'commander';
import { medplum } from '.';
import { MedplumClient } from '@medplum/core';
// import { prettyPrint } from './utils';

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
    .map((login) => {
      login.project;
      const keyValue = Object.entries(login.project);
      const values = keyValue.map(([key, value]) => `${key}: ${value}`);
      return values.join('\n');
    })
    .join('\n\n');

  console.log(projects);
}
