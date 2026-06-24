// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import type { Project } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import fs from 'node:fs';
import type { Mock, MockInstance } from 'vitest';
import { main } from '.';
import { FileSystemStorage } from './storage';
import { createMedplumClient } from './util/client';

vi.mock('./util/client');
vi.mock('node:child_process');
vi.mock('node:http');

vi.mock('node:fs', () => {
  const mock = {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    constants: {
      O_CREAT: 0,
    },
    promises: {
      readFile: vi.fn(async () => '{}'),
    },
  };
  return { default: mock, ...mock };
});

describe('CLI Project', () => {
  let medplum: MedplumClient;
  let processError: MockInstance;

  beforeAll(() => {
    process.exit = vi.fn<(exitCode?: number) => never>().mockImplementation(function exit(exitCode?: number) {
      throw new Error(`Process exited with exit code ${exitCode}`);
    });
    processError = vi.spyOn(process.stderr, 'write').mockImplementation(vi.fn());
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    medplum = new MockClient({ storage: new FileSystemStorage('default') });
    (createMedplumClient as unknown as Mock).mockImplementation(async () => medplum);

    console.log = vi.fn();
    console.error = vi.fn();
  });

  test('Project List', async () => {
    (fs.existsSync as unknown as Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as Mock).mockReturnValue(
      JSON.stringify({
        logins: JSON.stringify([
          {
            accessToken: 'abc',
            refreshToken: 'xyz',
            profile: {
              reference: 'Practitioner/124',
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
    await main(['node', 'index.js', 'project', 'list']);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(`(Project/456)`));
  });

  test('Project Current', async () => {
    (fs.existsSync as unknown as Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as Mock).mockReturnValue(
      JSON.stringify({
        activeLogin: JSON.stringify({
          accessToken: 'abc',
          refreshToken: 'xyz',
          profile: {
            reference: 'Practitioner/124',
            display: 'Alice Smith',
          },
          project: {
            reference: 'Project/456',
            display: 'My Project',
          },
        }),
      })
    );
    await main(['node', 'index.js', 'project', 'current']);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(`(Project/456)`));
  });

  test('Project Switch', async () => {
    (fs.existsSync as unknown as Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as Mock).mockReturnValue(
      JSON.stringify({
        logins: JSON.stringify([
          {
            accessToken: 'abc',
            refreshToken: 'xyz',
            profile: {
              reference: 'Practitioner/124',
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
    await main(['node', 'index.js', 'project', 'switch', '789']);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(`Switched to project 789`));
  });

  test('Project Switch invalid id', async () => {
    (fs.existsSync as unknown as Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as Mock).mockReturnValue(
      JSON.stringify({
        logins: JSON.stringify([
          {
            accessToken: 'abc',
            refreshToken: 'xyz',
            profile: {
              reference: 'Practitioner/124',
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

    await expect(main(['node', 'index.js', 'project', 'switch', 'bad-projectId'])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(processError).toHaveBeenCalledWith(expect.stringContaining('Error: Project bad-projectId not found.'));
  });

  test('Project invite with no login', async () => {
    await expect(
      main(['node', 'index.js', 'project', 'invite', 'homer', 'simpon', 'homer@simpson.com'])
    ).rejects.toThrow('Process exited with exit code 1');
    expect(processError).toHaveBeenCalledWith(
      expect.stringContaining('Error: Unauthenticated: run `npx medplum login` to login')
    );
  });

  test('Project invite with no project', async () => {
    (fs.existsSync as unknown as Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as Mock).mockReturnValue(
      JSON.stringify({
        activeLogin: JSON.stringify({
          accessToken: 'abc',
          refreshToken: 'xyz',
        }),
      })
    );

    await expect(
      main(['node', 'index.js', 'project', 'invite', 'homer', 'simpon', 'homer@simpson.com'])
    ).rejects.toThrow('Process exited with exit code 1');
    expect(processError).toHaveBeenCalledWith(expect.stringContaining('Error: No current project to invite user to'));
  });

  test('Project invite with no send-email flag', async () => {
    const project = await medplum.createResource<Project>({ resourceType: 'Project', name: 'test' });
    (fs.existsSync as unknown as Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as Mock).mockReturnValue(
      JSON.stringify({
        activeLogin: JSON.stringify({
          accessToken: 'abc',
          refreshToken: 'xyz',
          profile: {
            reference: 'Practitioner/124',
            display: 'Alice Smith',
          },
          project: {
            reference: `Project/${project.id}`,
            display: 'test',
          },
        }),
      })
    );
    await main([
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
    expect(console.log).not.toHaveBeenCalledWith(expect.stringMatching(`Email sent`));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(`See your users at https://app.medplum.com/admin/users`)
    );
  });

  test('Project invite with all default role and all flags', async () => {
    const project = await medplum.createResource<Project>({ resourceType: 'Project', name: 'test' });
    (fs.existsSync as unknown as Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as Mock).mockReturnValue(
      JSON.stringify({
        activeLogin: JSON.stringify({
          accessToken: 'abc',
          refreshToken: 'xyz',
          profile: {
            reference: 'Practitioner/124',
            display: 'Alice Smith',
          },
          project: {
            reference: `Project/${project.id}`,
            display: 'test',
          },
        }),
      })
    );
    await main([
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
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(`Email sent`));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(`See your users at https://app.medplum.com/admin/users`)
    );
  });
});
