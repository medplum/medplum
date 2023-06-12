import { MedplumClient } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { Project } from '@medplum/fhirtypes';
import fs from 'fs';
import { main } from '.';
import { FileSystemStorage } from './storage';
import { createMedplumClient } from './util/client';

jest.mock('./util/client');
jest.mock('child_process');
jest.mock('http');

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  constants: {
    O_CREAT: 0,
  },
  promises: {
    readFile: jest.fn(async () => '{}'),
  },
}));

let medplum: MedplumClient;

describe('CLI Project', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    medplum = new MockClient({ storage: new FileSystemStorage() });
    (createMedplumClient as unknown as jest.Mock).mockImplementation(async () => medplum);

    console.log = jest.fn();
    console.error = jest.fn();
    process.exit = jest.fn() as never;
  });

  test('Project List', async () => {
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        logins: JSON.stringify([
          {
            accessToken: 'abc',
            refreshToken: 'xyz',
            profile: {
              reference: 'Practitioner/123',
              display: 'Alice Smith',
            },
            project: {
              reference: 'Project/456',
              display: 'My Project',
            },
          },
        ]),
      })
    );
    await main(medplum, ['node', 'index.js', 'project', 'list']);
    expect(console.log).toBeCalledWith(expect.stringMatching(`(Project/456)`));
  });

  test('Project Current', async () => {
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        activeLogin: JSON.stringify({
          accessToken: 'abc',
          refreshToken: 'xyz',
          profile: {
            reference: 'Practitioner/123',
            display: 'Alice Smith',
          },
          project: {
            reference: 'Project/456',
            display: 'My Project',
          },
        }),
      })
    );
    await main(medplum, ['node', 'index.js', 'project', 'current']);
    expect(console.log).toBeCalledWith(expect.stringMatching(`(Project/456)`));
  });

  test('Project Switch', async () => {
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        logins: JSON.stringify([
          {
            accessToken: 'abc',
            refreshToken: 'xyz',
            profile: {
              reference: 'Practitioner/123',
              display: 'Alice Smith',
            },
            project: {
              reference: 'Project/456',
              display: 'My Project',
            },
          },
          {
            accessToken: 'def',
            refreshToken: '123',
            profile: {
              reference: 'Practitioner/789',
              display: 'Alice Smith',
            },
            project: {
              reference: 'Project/789',
              display: 'My Other Project',
            },
          },
        ]),
      })
    );
    await main(medplum, ['node', 'index.js', 'project', 'switch', '789']);
    expect(console.log).toBeCalledWith(expect.stringMatching(`Switched to project 789`));
  });

  test('Project Switch invalid id', async () => {
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        logins: JSON.stringify([
          {
            accessToken: 'abc',
            refreshToken: 'xyz',
            profile: {
              reference: 'Practitioner/123',
              display: 'Alice Smith',
            },
            project: {
              reference: 'Project/456',
              display: 'My Project',
            },
          },
          {
            accessToken: 'def',
            refreshToken: '123',
            profile: {
              reference: 'Practitioner/789',
              display: 'Alice Smith',
            },
            project: {
              reference: 'Project/789',
              display: 'My Other Project',
            },
          },
        ]),
      })
    );
    await main(medplum, ['node', 'index.js', 'project', 'switch', 'bad-projectId']);
    expect(console.log).toBeCalledWith(expect.stringMatching(`Error: project bad-projectId not found.`));
  });

  test('Project invite with no login', async () => {
    try {
      await main(medplum, ['node', 'index.js', 'project', 'invite', 'homer', 'simpon', 'homer@simpson.com']);
    } catch (err) {
      expect(console.error).toBeCalledWith('Unauthenticated: run `npx medplum login` to login');
    }
  });

  test('Project invite with no project', async () => {
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        activeLogin: JSON.stringify({
          accessToken: 'abc',
          refreshToken: 'xyz',
        }),
      })
    );
    try {
      await main(medplum, ['node', 'index.js', 'project', 'invite', 'homer', 'simpon', 'homer@simpson.com']);
    } catch (err) {
      expect(console.error).toBeCalledWith('No current project to invite user to');
    }
  });

  test('Project invite with no send-email flag', async () => {
    const project = await medplum.createResource<Project>({ resourceType: 'Project', name: 'test' });
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        activeLogin: JSON.stringify({
          accessToken: 'abc',
          refreshToken: 'xyz',
          profile: {
            reference: 'Practitioner/123',
            display: 'Alice Smith',
          },
          project: {
            reference: `Project/${project.id}`,
            display: 'test',
          },
        }),
      })
    );
    await main(medplum, [
      'node',
      'index.js',
      'project',
      'invite',
      '--admin',
      '-r',
      'Patient',
      'homer',
      'simpon',
      'homer@simpson.com',
    ]);
    expect(console.log).not.toBeCalledWith(expect.stringMatching(`Email sent`));
    expect(console.log).toBeCalledWith(expect.stringMatching(`See your users at https://app.medplum.com/admin/users`));
  });

  test('Project invite with all default role and all flags', async () => {
    const project = await medplum.createResource<Project>({ resourceType: 'Project', name: 'test' });
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        activeLogin: JSON.stringify({
          accessToken: 'abc',
          refreshToken: 'xyz',
          profile: {
            reference: 'Practitioner/123',
            display: 'Alice Smith',
          },
          project: {
            reference: `Project/${project.id}`,
            display: 'test',
          },
        }),
      })
    );
    await main(medplum, [
      'node',
      'index.js',
      'project',
      'invite',
      '--send-email',
      '--admin',
      '-r',
      'Patient',
      'homer',
      'simpon',
      'homer@simpson.com',
    ]);
    expect(console.log).toBeCalledWith(expect.stringMatching(`Email sent`));
    expect(console.log).toBeCalledWith(expect.stringMatching(`See your users at https://app.medplum.com/admin/users`));
  });
});
