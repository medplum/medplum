import { assertOk, Operator } from '@medplum/core';
import { AccessPolicy, Practitioner, Project, Reference, User } from '@medplum/fhirtypes';
import bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { resetPassword } from '../auth/resetpassword';
import { createPractitioner, createProjectMembership } from '../auth/utils';
import { getConfig } from '../config';
import { sendEmail } from '../email';
import { invalidRequest, sendOutcome, systemRepo } from '../fhir';
import { logger } from '../logger';
import { generateSecret } from '../oauth';
import { verifyProjectAdmin } from './utils';

export const inviteValidators = [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email address is required'),
];

export async function inviteHandler(req: Request, res: Response): Promise<void> {
  const projectDetails = await verifyProjectAdmin(req, res);
  if (!projectDetails) {
    res.sendStatus(404);
    return;
  }

  const { project } = projectDetails;
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  const profile = await inviteUser({
    ...req.body,
    project: project,
  });

  res.status(200).json({ profile });
}

export interface InviteRequest {
  readonly project: Project;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly accessPolicy?: Reference<AccessPolicy>;
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
        '',
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
        '',
      ].join('\n')
    );
  }
  const practitioner = await createPractitioner(request, project);
  await createProjectMembership(user, project, practitioner, request.accessPolicy);
  return practitioner;
}

async function searchForExisting(email: string): Promise<User | undefined> {
  const [outcome, bundle] = await systemRepo.search<User>({
    resourceType: 'User',
    filters: [
      {
        code: 'email',
        operator: Operator.EQUALS,
        value: email,
      },
    ],
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
  const [outcome, result] = await systemRepo.createResource<User>({
    resourceType: 'User',
    email,
    passwordHash,
  });
  assertOk(outcome);
  logger.info('Created: ' + (result as User).id);
  return result as User;
}
