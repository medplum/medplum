import { Command, Option } from 'commander';
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
  .action(() => {
    const login = medplum.getActiveLogin();
    if (!login) {
      throw new Error('Unauthenticated: run `npx medplum login` to login');
    }
    console.log(`${login.project.display} (${login.project.reference})`);
  });

project
  .command('switch')
  .description('Switching to another project from the current one')
  .argument('<projectId>')
  .action(async (projectId) => {
    await switchProject(medplum, projectId);
  });

project
  .command('invite')
  .description('Invite a member to your current project (run npx medplum project current to confirm)')
  .arguments('<firstName> <lastName> <email>')
  .option('-e', '--send-email')
  .option('-a', '--admin')
  .addOption(new Option('-r, --role <role>', 'Role of user').choices(['practitioner', 'patient', 'related-person']))
  .action(async (firstName, lastName, email, options) => {
    const login = medplum.getActiveLogin();
    if (!login) {
      throw new Error('Unauthenticated: run `npx medplum login` to login');
    }
    const projectId = login.project.id;
    const resourceType = options.role ? options.role : 'practioner';
    await inviteUser(projectId, firstName, lastName, email, resourceType, options.sendEmail, options.admin);
  });

async function switchProject(medplum: MedplumClient, projectId: string): Promise<void> {
  const logins = medplum.getLogins();
  const login = logins.find((login: LoginState) => login.project?.reference?.includes(projectId));
  if (!login) {
    console.log(`Error: project ${projectId} not found. Make sure you are added as a user to this project`);
  } else {
    await medplum.setActiveLogin(login);
    console.log(`Switched to project ${projectId}\n`);
  }
}

async function inviteUser(
  projectId: string,
  firstName: string,
  lastName: string,
  email: string,
  resourceType: string,
  sendEmail?: boolean,
  admin?: boolean
): Promise<void> {
  const body = {
    firstName,
    lastName,
    email,
    resourceType: resourceType.charAt(0).toUpperCase() + resourceType.slice(1),
    sendEmail,
    admin,
  };
  try {
    await medplum.post('admin/projects/' + projectId + '/invite', body);
    console.log('User created');
    if (sendEmail) {
      console.log('Email sent');
    }
    console.log(`See your users at ${medplum.baseUrl}/admin/users`);
  } catch (err) {
    console.log('Error while sending invite ' + err);
  }
}
