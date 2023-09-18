import {
  badRequest,
  createReference,
  InviteRequest,
  normalizeErrorString,
  OperationOutcomeError,
  Operator,
  ProfileResource,
} from '@medplum/core';
import { Practitioner, Project, ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body, oneOf, validationResult } from 'express-validator';
import Mail from 'nodemailer/lib/mailer';
import { resetPassword } from '../auth/resetpassword';
import { bcryptHashPassword, createProfile, createProjectMembership } from '../auth/utils';
import { getConfig } from '../config';
import { getAuthenticatedContext } from '../context';
import { sendEmail } from '../email/email';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { generateSecret } from '../oauth/keys';
import { getUserByEmailInProject, getUserByEmailWithoutProject } from '../oauth/utils';

export const inviteValidators = [
  body('resourceType').isIn(['Patient', 'Practitioner', 'RelatedPerson']).withMessage('Resource type is required'),
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  oneOf(
    [
      body('email').isEmail().withMessage('Valid email address is required'),
      body('externalId').notEmpty().withMessage('External ID cannot be empty'),
    ],
    { message: 'Either email or externalId is required' }
  ),
];

export async function inviteHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  const inviteRequest = { ...req.body } as ServerInviteRequest;
  const { projectId } = req.params;
  if (ctx.project.superAdmin) {
    inviteRequest.project = await systemRepo.readResource('Project', projectId as string);
  } else {
    inviteRequest.project = ctx.project;
  }

  try {
    const { membership } = await inviteUser(inviteRequest);
    res.status(200).json(membership);
  } catch (err) {
    ctx.logger.info('Error inviting user to project', {
      project: projectId,
      error: normalizeErrorString(err),
    });
    res.status(200).json({ error: err });
  }
}

export interface ServerInviteRequest extends InviteRequest {
  project: Project;
}

export interface ServerInviteResponse {
  user: User;
  profile: ProfileResource;
  membership: ProjectMembership;
}

export async function inviteUser(request: ServerInviteRequest): Promise<ServerInviteResponse> {
  const ctx = getAuthenticatedContext();
  if (request.email) {
    request.email = request.email.toLowerCase();
  }

  const project = request.project;
  const email = request.email;
  let user = undefined;
  let existingUser = true;
  let passwordResetUrl = undefined;

  if (email) {
    if (request.resourceType === 'Patient') {
      user = await getUserByEmailInProject(email, project.id as string);
    } else {
      user = await getUserByEmailWithoutProject(email);
    }
  }

  if (!user) {
    existingUser = false;
    ctx.logger.info('User creation request received', { email });
    user = await createUser(request);
    ctx.logger.info('User created', { id: user.id, email });
    passwordResetUrl = await resetPassword(user);
  }

  let profile = await searchForExistingProfile(request);
  if (!profile) {
    profile = (await createProfile(
      project,
      request.resourceType,
      request.firstName,
      request.lastName,
      email
    )) as Practitioner;
  }

  const membershipTemplate = request.membership ?? {};
  if (request.externalId !== undefined) {
    membershipTemplate.externalId = request.externalId;
  }
  if (request.accessPolicy !== undefined) {
    membershipTemplate.accessPolicy = request.accessPolicy;
  }
  if (request.access !== undefined) {
    membershipTemplate.access = request.access;
  }
  if (request.admin !== undefined) {
    membershipTemplate.admin = request.admin;
  }

  const membership = await createProjectMembership(user, project, profile, membershipTemplate);

  if (email && request.sendEmail !== false) {
    try {
      await sendInviteEmail(request, user, existingUser, passwordResetUrl);
    } catch (err) {
      throw new OperationOutcomeError(badRequest('Could not send email. Make sure you have AWS SES set up.'), err);
    }
  }

  return { user, profile, membership };
}

async function createUser(request: ServerInviteRequest): Promise<User> {
  const { firstName, lastName, externalId } = request;
  const email = request.email?.toLowerCase();
  const password = request.password ?? generateSecret(16);
  const passwordHash = await bcryptHashPassword(password);

  let project: Reference<Project> | undefined = undefined;
  if (request.resourceType === 'Patient' || externalId) {
    // Users can optionally be scoped to a project.
    // We force users to be scoped to a project if:
    // 1) They are a patient
    // 2) They are a practitioner with an externalId
    project = createReference(request.project);
  }

  return systemRepo.createResource<User>({
    resourceType: 'User',
    firstName,
    lastName,
    email,
    passwordHash,
    project,
  });
}

async function searchForExistingProfile(request: ServerInviteRequest): Promise<ProfileResource | undefined> {
  const { project, resourceType, membership, email } = request;

  if (membership?.profile) {
    const result = await systemRepo.readReference(membership.profile);
    if (result.meta?.project !== project.id) {
      throw new OperationOutcomeError(badRequest('Profile does not belong to project'));
    }
    if (result.resourceType !== resourceType) {
      throw new OperationOutcomeError(badRequest('Profile resourceType does not match request'));
    }
    return result as ProfileResource;
  }

  if (email) {
    return systemRepo.searchOne<ProfileResource>({
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
  }

  return undefined;
}

async function sendInviteEmail(
  request: ServerInviteRequest,
  user: User,
  existing: boolean,
  resetPasswordUrl: string | undefined
): Promise<void> {
  const options: Mail.Options = { to: user.email };
  if (existing) {
    // Existing user
    options.subject = `Medplum: Welcome to ${request.project.name}`;
    options.text = [
      `You were invited to ${request.project.name}`,
      '',
      `The next time you sign in, you will see ${request.project.name} as an option.`,
      '',
      `You can sign in here: ${getConfig().appBaseUrl}signin`,
      '',
      'Thank you,',
      'Medplum',
      '',
    ].join('\n');
  } else {
    // New user
    options.subject = 'Welcome to Medplum';
    options.text = [
      `You were invited to ${request.project.name}`,
      '',
      'Please click on the following link to create your account:',
      '',
      resetPasswordUrl,
      '',
      'Thank you,',
      'Medplum',
      '',
    ].join('\n');
  }
  await sendEmail(systemRepo, options);
}
