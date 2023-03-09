import { createReference, Operator, ProfileResource } from '@medplum/core';
import {
  AccessPolicy,
  Practitioner,
  Project,
  ProjectMembership,
  Reference,
  ResourceType,
  User,
} from '@medplum/fhirtypes';
import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { body, oneOf, validationResult } from 'express-validator';
import { resetPassword } from '../auth/resetpassword';
import { createProfile, createProjectMembership } from '../auth/utils';
import { getConfig } from '../config';
import { sendEmail } from '../email/email';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { logger } from '../logger';
import { generateSecret } from '../oauth/keys';
import { getUserByEmailWithoutProject } from '../oauth/utils';

export const inviteValidators = [
  body('resourceType').isIn(['Patient', 'Practitioner', 'RelatedPerson']).withMessage('Resource type is required'),
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  oneOf(
    [
      body('email').isEmail().withMessage('Valid email address is required'),
      body('externalId').notEmpty().withMessage('External ID cannot be empty'),
    ],
    'Either email or externalId is required'
  ),
];

export async function inviteHandler(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  const { membership } = await inviteUser({
    ...req.body,
    project: res.locals.project,
  });

  res.status(200).json(membership);
}

export interface InviteRequest {
  readonly project: Project;
  readonly resourceType: 'Patient' | 'Practitioner' | 'RelatedPerson';
  readonly firstName: string;
  readonly lastName: string;
  readonly email?: string;
  readonly externalId?: string;
  readonly accessPolicy?: Reference<AccessPolicy>;
  readonly sendEmail?: boolean;
  readonly password?: string;
  readonly invitedBy?: Reference<User>;
}

export async function inviteUser(
  request: InviteRequest
): Promise<{ user: User; profile: ProfileResource; membership: ProjectMembership }> {
  const project = request.project;
  let user = undefined;
  let existingUser = true;
  let passwordResetUrl = undefined;
  let profile = undefined;

  if (request.email) {
    user = await getUserByEmailWithoutProject(request.email);
    profile = await searchForExistingProfile(project, request.resourceType, request.email);
  }

  if (!user) {
    existingUser = false;
    user = await createUser(request);
    passwordResetUrl = await resetPassword(user);
  }

  if (!profile) {
    profile = (await createProfile(
      project,
      request.resourceType,
      request.firstName,
      request.lastName,
      request.email
    )) as Practitioner;
  }

  const membership = await createProjectMembership(user, project, profile, request.accessPolicy);

  if (request.email && request.sendEmail !== false) {
    await sendInviteEmail(request, user, existingUser, passwordResetUrl);
  }

  return { user, profile, membership };
}

async function createUser(request: InviteRequest): Promise<User> {
  const { firstName, lastName, email, externalId } = request;
  const password = request.password || generateSecret(16);
  logger.info('Create user ' + email);
  const passwordHash = await bcrypt.hash(password, 10);
  let result: User;

  if (externalId) {
    // If creating a user by externalId, then we are creating a user for a third-party system.
    // The user must be scoped to the project.
    result = await systemRepo.createResource<User>({
      resourceType: 'User',
      firstName,
      lastName,
      externalId,
      passwordHash,
      project: createReference(request.project),
    });
  } else {
    // Otherwise, we are creating a user for Medplum.
    result = await systemRepo.createResource<User>({
      resourceType: 'User',
      firstName,
      lastName,
      email,
      passwordHash,
    });
  }

  logger.info('Created: ' + result.id);
  return result;
}

async function searchForExistingProfile(
  project: Project,
  resourceType: ResourceType,
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
