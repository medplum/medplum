import { InviteRequest, LoginState, MedplumClient } from '@medplum/core';
import { Command, Option } from 'commander';
import { createMedplumClient } from './util/client';
import { createMedplumCommand } from './util/command';

const projectListCommand = createMedplumCommand('list');
const projectCurrentCommand = createMedplumCommand('current');
const projectSwitchCommand = createMedplumCommand('switch');
const projectInviteCommand = createMedplumCommand('invite');

export const project = new Command('project')
  .addCommand(projectListCommand)
  .addCommand(projectCurrentCommand)
  .addCommand(projectSwitchCommand)
  .addCommand(projectInviteCommand);

projectListCommand.description('List of current projects').action(async (options) => {
  const medplum = await createMedplumClient(options);
  projectList(medplum);
});

function projectList(medplum: MedplumClient): void {
  const logins = medplum.getLogins();

  const projects = logins
    .map((login: LoginState) => `${login.project.display} (${login.project.reference})`)
    .join('\n\n');

  console.log(projects);
}

projectCurrentCommand.description('Project you are currently on').action(async (options) => {
  const medplum = await createMedplumClient(options);
  const login = medplum.getActiveLogin();
  if (!login) {
    throw new Error('Unauthenticated: run `npx medplum login` to login');
  }
  console.log(`${login.project.display} (${login.project.reference})`);
});

projectSwitchCommand
  .description('Switching to another project from the current one')
  .argument('<projectId>')
  .action(async (projectId, options) => {
    const medplum = await createMedplumClient(options);
    await switchProject(medplum, projectId);
  });

projectInviteCommand
  .description('Invite a member to your current project (run npx medplum project current to confirm)')
  .arguments('<firstName> <lastName> <email>')
  .option('--send-email', 'If you want to send the email when inviting the user')
  .option('--admin', 'If the user you are inviting is an admin')
  .addOption(
    new Option('-r, --role <role>', 'Role of user')
      .choices(['Practitioner', 'Patient', 'RelatedPerson'])
      .default('Practitioner')
  )
  .action(async (firstName, lastName, email, options) => {
    const medplum = await createMedplumClient(options);
    const login = medplum.getActiveLogin();
    if (!login) {
      throw new Error('Unauthenticated: run `npx medplum login` to login');
    }
    if (!login?.project?.reference) {
      throw new Error('No current project to invite user to');
    }

    const projectId = login.project.reference.split('/')[1];
    const inviteBody: InviteRequest = {
      resourceType: options.role,
      firstName,
      lastName,
      email,
      sendEmail: !!options.sendEmail,
      admin: !!options.admin,
    };
    await inviteUser(projectId, inviteBody, medplum);
  });

async function switchProject(medplum: MedplumClient, projectId: string): Promise<void> {
  const logins = medplum.getLogins();
  const login = logins.find((login: LoginState) => login.project.reference?.includes(projectId));
  if (!login) {
    throw new Error(`Project ${projectId} not found. Make sure you are added as a user to this project`);
  }
  await medplum.setActiveLogin(login);
  console.log(`Switched to project ${projectId}\n`);
}

async function inviteUser(projectId: string, inviteBody: InviteRequest, medplum: MedplumClient): Promise<void> {
  await medplum.invite(projectId, inviteBody);
  if (inviteBody.sendEmail) {
    console.log('Email sent');
  }
  console.log('See your users at https://app.medplum.com/admin/users');
}
