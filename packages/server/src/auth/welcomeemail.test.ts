// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Project, User } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { vi } from 'vitest';
import { getConfig, loadTestConfig } from '../config/loader';
import { sendEmail } from '../email/email';
import type { SystemRepository } from '../fhir/repo';
import { globalLogger } from '../logger';
import { WELCOME_EMAIL_SUBJECT, buildWelcomeEmail, sendWelcomeEmail, welcomeEmailText } from './welcomeemail';

vi.mock('../email/email');

const sendEmailMock = vi.mocked(sendEmail);

// The repo is only forwarded to sendEmail (which is mocked), so a sentinel is fine.
const systemRepo = { id: 'system' } as unknown as SystemRepository;

const CTX = {
  projectName: 'Hamilton Project',
  firstName: 'Alexander',
  appBaseUrl: 'https://app.example.com/',
  supportEmail: 'support@example.com',
} as const;

function makeProject(overrides: Partial<Project> = {}): WithId<Project> {
  return { resourceType: 'Project', id: randomUUID(), name: 'Test Project', ...overrides };
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    resourceType: 'User',
    firstName: 'Alexander',
    lastName: 'Hamilton',
    email: 'alex@example.com',
    ...overrides,
  };
}

describe('Welcome email', () => {
  beforeAll(async () => {
    await loadTestConfig();
  });

  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue(undefined);
  });

  describe('welcomeEmailText', () => {
    test('Includes greeting, quoted project name, and dynamic links', () => {
      const text = welcomeEmailText(CTX);
      expect(text).toContain('Hi Alexander');
      expect(text).toContain('Your new project "Hamilton Project" is ready to go.');
      expect(text).toContain('https://app.example.com/signin');
      expect(text).toContain('https://app.example.com/admin/users');
      expect(text).toContain('support@example.com');
    });

    test('Indents nested sub-bullets with four leading spaces', () => {
      const text = welcomeEmailText(CTX);
      expect(text).toContain('\n    - Agentic Coding Guide:');
      expect(text).toContain('\n    - Contribute:');
    });

    test('Contains no markup or bold markers', () => {
      const text = welcomeEmailText(CTX);
      expect(text).not.toContain('**');
      expect(text).not.toContain('<');
    });

    test('Omits first name when not provided', () => {
      const text = welcomeEmailText({ ...CTX, firstName: undefined });
      // Clean greeting with no dangling name or stray whitespace.
      expect(text).not.toContain('undefined');
      expect(text.startsWith('Hi,\n')).toBe(true);
    });
  });

  describe('buildWelcomeEmail', () => {
    test('Sets recipient, subject, and a plain-text body only (no html)', () => {
      const options = buildWelcomeEmail('alex@example.com', CTX);
      expect(options.to).toBe('alex@example.com');
      expect(options.subject).toBe(WELCOME_EMAIL_SUBJECT);
      expect(options.text).toContain('Hamilton Project');
      // Plain text only — no HTML part, keeping the message lightweight.
      expect(options.html).toBeUndefined();
      // from is resolved by sendEmail from server settings, not set here.
      expect(options.from).toBeUndefined();
    });
  });

  describe('sendWelcomeEmail', () => {
    test('Sends to the project owner using server settings', async () => {
      const project = makeProject({ name: 'Hamilton Project' });
      const user = makeUser({ email: 'alex@example.com', firstName: 'Alexander' });

      await sendWelcomeEmail(systemRepo, project, user);

      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      const [repoArg, optionsArg, projectArg] = sendEmailMock.mock.calls[0];
      expect(repoArg).toBe(systemRepo);
      expect(projectArg).toBe(project);
      expect(optionsArg.to).toBe('alex@example.com');
      expect(optionsArg.subject).toBe(WELCOME_EMAIL_SUBJECT);
      expect(optionsArg.text).toContain('Hamilton Project');
      expect(optionsArg.text).toContain(`${getConfig().appBaseUrl}signin`);
    });

    test('Uses the bare support email address in the body, not the display-name form', async () => {
      // Test config supportEmail is `"Medplum" <support@medplum.com>`.
      const project = makeProject();
      const user = makeUser();

      await sendWelcomeEmail(systemRepo, project, user);

      const text = sendEmailMock.mock.calls[0][1].text as string;
      expect(text).toContain('support@medplum.com');
      expect(text).not.toContain('"Medplum" <support@medplum.com>');
    });

    test('Falls back to a default project name when unnamed', async () => {
      const project = makeProject({ name: undefined });
      const user = makeUser();

      await sendWelcomeEmail(systemRepo, project, user);

      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect(sendEmailMock.mock.calls[0][1].text).toContain('your project');
    });

    test('Does not send when the user has no email', async () => {
      const project = makeProject();
      const user = makeUser({ email: undefined });

      await sendWelcomeEmail(systemRepo, project, user);

      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    test('Swallows send failures and logs a warning', async () => {
      const warnSpy = vi.spyOn(globalLogger, 'warn').mockImplementation(() => undefined);
      sendEmailMock.mockRejectedValueOnce(new Error('SES not configured'));

      const project = makeProject();
      const user = makeUser();

      // Must not throw — a mail failure cannot block registration.
      await expect(sendWelcomeEmail(systemRepo, project, user)).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to send welcome email',
        expect.objectContaining({ projectId: project.id, error: expect.stringContaining('SES not configured') })
      );
      warnSpy.mockRestore();
    });
  });
});
