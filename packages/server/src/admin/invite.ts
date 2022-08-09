import { Operator } from '@medplum/core';
import { AccessPolicy, Practitioner, Project, Reference, User } from '@medplum/fhirtypes';
import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { resetPassword } from '../auth/resetpassword';
import { createProfile, createProjectMembership } from '../auth/utils';
import { getConfig } from '../config';
import { sendEmail } from '../email/email';
import { invalidRequest, sendOutcome, systemRepo } from '../fhir';
import { logger } from '../logger';
import { generateSecret, getUserByEmailWithoutProject } from '../oauth';
import { verifyProjectAdmin } from './utils';

export const inviteValidators = [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email address is required'),
];

export async function inviteHandler(req: Request, res: Response): Promise<void> {
  const project = await verifyProjectAdmin(req, res);
  if (!project) {
    res.sendStatus(404);
    return;
  }

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
  let user = await getUserByEmailWithoutProject(request.email);

  if (user) {
    // Existing user
    await sendEmail({
      to: user.email,
      subject: `Medplum: Welcome to ${request.project.name}`,
      text: [
        `You were invited to ${request.project.name}`,
        '',
        `The next time you sign-in, you will see ${request.project.name} as an option.`,
        '',
        `You can sign in here: ${getConfig().appBaseUrl}signin`,
        '',
        'Thank you,',
        'Medplum',
        '',
      ].join('\n'),
    });
  } else {
    // New user
    user = await createUser(request);
    const url = await resetPassword(user);
    await sendEmail({
      to: user.email,
      subject: 'Welcome to Medplum',
      text: [
        `You were invited to ${request.project.name}`,
        '',
        'Please click on the following link to create your account:',
        '',
        url,
        '',
        'Thank you,',
        'Medplum',
        '',
      ].join('\n'),
    });
  }
  let practitioner = await searchForExistingPractitioner(project, request.email);
  if (!practitioner) {
    practitioner = (await createProfile(
      project,
      'Practitioner',
      request.firstName,
      request.lastName,
      request.email
    )) as Practitioner;
  }
  await createProjectMembership(user, project, practitioner, request.accessPolicy);
  return practitioner;
}

async function createUser(request: InviteRequest): Promise<User> {
  const email = request.email;
  const password = generateSecret(16);
  logger.info('Create user ' + email);
  const passwordHash = await bcrypt.hash(password, 10);
  const result = await systemRepo.createResource<User>({
    resourceType: 'User',
    email,
    passwordHash,
  });
  logger.info('Created: ' + result.id);
  return result;
}

async function searchForExistingPractitioner(project: Project, email: string): Promise<Practitioner | undefined> {
  const bundle = await systemRepo.search<Practitioner>({
    resourceType: 'Practitioner',
    filters: [
      {
        code: '_project',
        operator: Operator.EQUALS,
        value: project.id as string,
      },
      {
        code: 'email',
        operator: Operator.EQUALS,
        value: email,
      },
    ],
  });
  if (bundle.entry && bundle.entry.length > 0) {
    return bundle.entry[0].resource as Practitioner;
  }
  return undefined;
}
