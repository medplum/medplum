import {
  allOk,
  badRequest,
  conflict,
  createReference,
  getReferenceString,
  InviteRequest,
  normalizeErrorString,
  OperationOutcomeError,
  Operator,
  ProfileResource,
} from '@medplum/core';
import { Practitioner, Project, ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body, oneOf } from 'express-validator';
import Mail from 'nodemailer/lib/mailer';
import { resetPassword } from '../auth/resetpassword';
import { bcryptHashPassword, createProfile, createProjectMembership } from '../auth/utils';
import { getConfig } from '../config';
import { getAuthenticatedContext, getLogger } from '../context';
import { sendEmail } from '../email/email';
import { getSystemRepo, Repository } from '../fhir/repo';
import { sendResponse } from '../fhir/response';
import { generateSecret } from '../oauth/keys';
import { getUserByEmailInProject, getUserByEmailWithoutProject } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';

export const inviteValidator = makeValidationMiddleware([
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
]);

export async function inviteHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();

  const inviteRequest = { ...req.body } as ServerInviteRequest;
  const { projectId } = req.params;
  if (ctx.project.superAdmin) {
    const systemRepo = getSystemRepo();
    inviteRequest.project = await systemRepo.readResource('Project', projectId as string);
  } else {
    inviteRequest.project = ctx.project;
  }

  const { membership } = await inviteUser(inviteRequest);
  return sendResponse(req, res, allOk, membership);
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
  const systemRepo = getSystemRepo();
  const logger = getLogger();

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
    logger.info('User creation request received', { email });
    user = await createUser(request);
    logger.info('User created', { id: user.id, email });
    passwordResetUrl = await resetPassword(user, 'invite');
  }

  let profile = await searchForExistingProfile(request);
  if (!profile) {
    logger.info('Creating profile for invite request', {
      project: getReferenceString(project),
      email,
      profileType: request.resourceType,
    });
    profile = (await createProfile(
      project,
      request.resourceType,
      request.firstName,
      request.lastName,
      email
    )) as Practitioner;

    logger.info('Profile  created', { profile: getReferenceString(profile) });
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

  const membership = await createOrUpdateProjectMembership(
    systemRepo,
    user,
    project,
    profile,
    membershipTemplate,
    !!request.upsert
  );

  if (email && request.sendEmail !== false) {
    await sendInviteEmail(systemRepo, request, user, existingUser, passwordResetUrl);
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

  const systemRepo = getSystemRepo();
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
  const systemRepo = getSystemRepo();

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

async function createOrUpdateProjectMembership(
  systemRepo: Repository,
  user: User,
  project: Project,
  profile: ProfileResource,
  membershipTemplate: Partial<ProjectMembership>,
  upsert: boolean
): Promise<ProjectMembership> {
  const existingMembership = await searchForExistingMembership(systemRepo, user, project);
  if (existingMembership) {
    if (!upsert) {
      throw new OperationOutcomeError(conflict('User is already a member of this project'));
    }

    if (existingMembership.profile?.reference !== getReferenceString(profile)) {
      throw new OperationOutcomeError(conflict('User is already a member of this project with a different profile'));
    }

    // Update the existing membership
    // Be careful to preserve the critical properties: id, project, user, and profile
    return systemRepo.updateResource<ProjectMembership>({
      ...existingMembership,
      ...membershipTemplate,
      resourceType: 'ProjectMembership',
      id: existingMembership.id,
      project: createReference(project),
      user: createReference(user),
      profile: createReference(profile),
    });
  }

  // Otherwise, create the new membership
  return createProjectMembership(user, project, profile, membershipTemplate);
}

async function searchForExistingMembership(
  systemRepo: Repository,
  user: User,
  project: Project
): Promise<ProjectMembership | undefined> {
  return systemRepo.searchOne<ProjectMembership>({
    resourceType: 'ProjectMembership',
    filters: [
      {
        code: 'user',
        operator: Operator.EQUALS,
        value: getReferenceString(user),
      },
      {
        code: 'project',
        operator: Operator.EQUALS,
        value: getReferenceString(project),
      },
    ],
  });
}

async function sendInviteEmail(
  systemRepo: Repository,
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
  try {
    await sendEmail(systemRepo, options);
  } catch (err) {
    // A common error for new self-hosted Medplum servers is that SES is not configured.
    // A long time ago, we made the mistake of establishing a convention of HTTP 200 + OperationOutcome for this case.
    // To preserve this behavior, we throw an OperationOutcomeError with allOk ID.
    throw new OperationOutcomeError({
      resourceType: 'OperationOutcome',
      id: allOk.id,
      issue: [
        {
          severity: 'error',
          code: 'exception',
          details: {
            text: 'Could not send email. Make sure you have AWS SES set up.',
          },
          diagnostics: normalizeErrorString(err),
        },
      ],
    });
  }
}
