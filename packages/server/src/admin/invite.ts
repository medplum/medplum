import { assertOk, Operator, Practitioner, Project, User } from '@medplum/core';
import bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { resetPassword } from '../auth/resetpassword';
import { createPractitioner, createProjectMembership } from '../auth/utils';
import { getConfig } from '../config';
import { sendEmail } from '../email';
import { invalidRequest, repo, sendOutcome } from '../fhir';
import { logger } from '../logger';
import { generateSecret } from '../oauth';
import { verifyProjectAdmin } from './utils';

export const inviteValidators = [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email address is required')
];

export async function inviteHandler(req: Request, res: Response): Promise<Response> {
  const projectDetails = await verifyProjectAdmin(req, res);
  if (!projectDetails) {
    return res.sendStatus(404);
  }

  const { project } = projectDetails;
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendOutcome(res, invalidRequest(errors));
  }

  const profile = await inviteUser({
    project: project,
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    email: req.body.email
  });

  return res.status(200).json({ profile });
}

export interface InviteRequest {
  project: Project;
  firstName: string;
  lastName: string;
  email: string;
}

export async function inviteUser(request: InviteRequest): Promise<Practitioner> {
  const project = request.project;
  let user = await searchForExisting(request.email);

  if (user) {
    // Existing user
    await sendEmail(
      [user.email as string],
      `Medplum: Welcome to ${request.project.name}`,
      [
        `You were invited to ${request.project.name}`,
        '',
        `The next time you sign-in, you will see ${request.project.name} as an option.`,
        '',
        `You can sign in here: ${getConfig().appBaseUrl}signin`,
        '',
        'Thank you,',
        'Medplum',
        ''
      ].join('\n')
    );

  } else {
    // New user
    user = await createUser(request);
    const url = await resetPassword(user);
    await sendEmail(
      [user.email as string],
      'Welcome to Medplum',
      [
        `You were invited to ${request.project.name}`,
        '',
        'Please click on the following link to create your account:',
        '',
        url,
        '',
        'Thank you,',
        'Medplum',
        ''
      ].join('\n')
    );
  }
  const practitioner = await createPractitioner(request, project);
  await createProjectMembership(user, project, practitioner, false);
  return practitioner;
}

async function searchForExisting(email: string): Promise<User | undefined> {
  const [outcome, bundle] = await repo.search<User>({
    resourceType: 'User',
    filters: [{
      code: 'email',
      operator: Operator.EQUALS,
      value: email
    }]
  });
  assertOk(outcome);
  if (bundle?.entry && bundle.entry.length > 0) {
    return bundle.entry[0].resource as User;
  }
  return undefined;
}

async function createUser(request: InviteRequest): Promise<User> {
  const email = request.email;
  const password = generateSecret(16);
  logger.info('Create user ' + email);
  const passwordHash = await bcrypt.hash(password, 10);
  const [outcome, result] = await repo.createResource<User>({
    resourceType: 'User',
    email,
    passwordHash
  });
  assertOk(outcome);
  logger.info('Created: ' + (result as User).id);
  return result as User;
}
