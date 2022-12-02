import { forbidden, Operator, ProfileResource } from '@medplum/core';
import { AccessPolicy, Practitioner, Project, Reference, User } from '@medplum/fhirtypes';
import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { resetPassword } from '../auth/resetpassword';
import { createProfile, createProjectMembership } from '../auth/utils';
import { getConfig } from '../config';
import { sendEmail } from '../email/email';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { logger } from '../logger';
import { generateSecret } from '../oauth/keys';
import { getUserByEmailWithoutProject } from '../oauth/utils';
import { verifyProjectAdmin } from './utils';

export const inviteValidators = [
  body('resourceType').isIn(['Patient', 'Practitioner', 'RelatedPerson']).withMessage('Resource type is required'),
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email address is required'),
];

export async function inviteHandler(req: Request, res: Response): Promise<void> {
  const project = await verifyProjectAdmin(req, res);
  if (!project) {
    sendOutcome(res, forbidden);
    return;
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  const { profile } = await inviteUser({
    ...req.body,
    project: project,
  });

  res.status(200).json({ profile });
}

export interface InviteRequest {
  readonly project: Project;
  readonly resourceType: 'Patient' | 'Practitioner' | 'RelatedPerson';
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly accessPolicy?: Reference<AccessPolicy>;
  readonly sendEmail?: boolean;
}

export async function inviteUser(request: InviteRequest): Promise<{ user: User; profile: ProfileResource }> {
  const project = request.project;
  let user = await getUserByEmailWithoutProject(request.email);
  let existingUser = true;
  let passwordResetUrl = undefined;

  if (!user) {
    existingUser = false;
    user = await createUser(request);
    passwordResetUrl = await resetPassword(user);
  }

  let profile = await searchForExistingProfile(project, request.resourceType, request.email);
  if (!profile) {
    profile = (await createProfile(
      project,
      request.resourceType,
      request.firstName,
      request.lastName,
      request.email
    )) as Practitioner;
  }
  await createProjectMembership(user, project, profile, request.accessPolicy);

  if (request.sendEmail !== false) {
    await sendInviteEmail(request, user, existingUser, passwordResetUrl);
  }

  return { user, profile };
}

async function createUser(request: InviteRequest): Promise<User> {
  const { firstName, lastName, email } = request;
  const password = generateSecret(16);
  logger.info('Create user ' + email);
  const passwordHash = await bcrypt.hash(password, 10);
  const result = await systemRepo.createResource<User>({
    resourceType: 'User',
    firstName,
    lastName,
    email,
    passwordHash,
  });
  logger.info('Created: ' + result.id);
  return result;
}

async function searchForExistingProfile(
  project: Project,
  resourceType: string,
  email: string
): Promise<ProfileResource | undefined> {
  const bundle = await systemRepo.search<ProfileResource>({
    resourceType,
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
  return bundle.entry?.[0]?.resource;
}

async function sendInviteEmail(
  request: InviteRequest,
  user: User,
  existing: boolean,
  resetPasswordUrl: string | undefined
): Promise<void> {
  if (existing) {
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
    await sendEmail({
      to: user.email,
      subject: 'Welcome to Medplum',
      text: [
        `You were invited to ${request.project.name}`,
        '',
        'Please click on the following link to create your account:',
        '',
        resetPasswordUrl,
        '',
        'Thank you,',
        'Medplum',
        '',
      ].join('\n'),
    });
  }
}
