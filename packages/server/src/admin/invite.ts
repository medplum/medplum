// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { InviteRequest, ProfileResource, SearchRequest, WithId } from '@medplum/core';
import {
  allOk,
  badRequest,
  conflict,
  createReference,
  getReferenceString,
  isCreated,
  isNotFound,
  multipleMatches,
  normalizeErrorString,
  OperationOutcomeError,
  Operator,
  resolveId,
} from '@medplum/core';
import type {
  AccessPolicy,
  Patient,
  Project,
  ProjectMembership,
  Reference,
  RelatedPerson,
  User,
} from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body, oneOf } from 'express-validator';
import type Mail from 'nodemailer/lib/mailer';
import { authenticator } from 'otplib';
import { resetPassword } from '../auth/resetpassword';
import { bcryptHashPassword, createProjectMembership } from '../auth/utils';
import { getConfig } from '../config/loader';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../constants';
import { getAuthenticatedContext, tryGetRequestContext } from '../context';
import { sendEmail } from '../email/email';
import type { SystemRepository } from '../fhir/repo';
import { getProjectSystemRepo } from '../fhir/repo';
import { sendFhirResponse } from '../fhir/response';
import { getLogger } from '../logger';
import { generateSecret } from '../oauth/keys';
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
  body('patient.reference')
    .optional()
    .matches(/^Patient\/[^/]+$/)
    .withMessage('Patient must be a reference to a Patient resource'),
  body('password')
    .optional()
    .isLength({ min: MIN_PASSWORD_LENGTH })
    .withMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .isByteLength({ max: MAX_PASSWORD_LENGTH })
    .withMessage(`Password must be no more than ${MAX_PASSWORD_LENGTH} characters`),
]);

export async function inviteHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();

  const inviteRequest = { ...req.body } as ServerInviteRequest;
  const { projectId } = req.params;
  if (ctx.project.superAdmin) {
    inviteRequest.project = await ctx.systemRepo.readResource('Project', projectId as string);
  } else {
    inviteRequest.project = ctx.project;
  }

  const { membership } = await inviteUser(inviteRequest);
  return sendFhirResponse(req, res, allOk, membership);
}

export interface ServerInviteRequest extends InviteRequest {
  project: WithId<Project>;
}

export interface ServerInviteResponse {
  user: WithId<User>;
  profile: WithId<ProfileResource>;
  membership: WithId<ProjectMembership>;
}

export async function inviteUser(request: ServerInviteRequest): Promise<ServerInviteResponse> {
  const systemRepo = await getProjectSystemRepo(request.project);
  const logger = getLogger();

  if (request.email) {
    request.email = request.email.toLowerCase();
  }

  const { project, email } = request;
  let existingUser = false;
  let passwordResetUrl: string | undefined;

  // Upsert User resource
  const userResource = await makeUserResource(request);
  let user: WithId<User>;
  if (email) {
    const { resource: result, outcome } = await systemRepo.withTransaction(
      async (txRepo) => {
        // If inviting with an email address, check for existing memberships
        // tied to this project/email combination that are at a different scope
        // than the one we would create. This avoids confusion of someone
        // having separate server-scoped and project-scoped user records.
        //
        // This check is bypassed if the caller explicitly passes `forceNewMembership: true`
        if (!request.forceNewMembership) {
          const projectFilter = userResource.project
            ? { code: 'user:User.project', operator: Operator.MISSING, value: 'true' }
            : { code: 'user:User.project', operator: Operator.EXACT, value: `Project/${project.id}` };

          const existingMemberships = await txRepo.searchResources<ProjectMembership>({
            resourceType: 'ProjectMembership',
            filters: [
              { code: 'user:User.email', operator: Operator.EXACT, value: email },
              { code: 'project', operator: Operator.EXACT, value: `Project/${project.id}` },
              projectFilter,
            ],
          });

          if (existingMemberships.length > 0) {
            throw new OperationOutcomeError(conflict('User is already a member of this project'));
          }
        }

        const searchRequest: SearchRequest<User> = {
          resourceType: 'User',
          filters: [
            {
              code: 'email',
              operator: Operator.EXACT,
              value: email,
            },
            userResource.project
              ? { code: 'project', operator: Operator.EQUALS, value: `Project/${project.id}` }
              : { code: 'project', operator: Operator.MISSING, value: 'true' },
          ],
        };

        return txRepo.conditionalCreate(userResource, searchRequest);
      },
      {
        resourceTypes: ['ProjectMembership', 'User'],
        source: 'inviteUser.upsertUser',
        serializable: true,
      }
    );
    user = result;
    existingUser = !isCreated(outcome);
  } else {
    user = await systemRepo.createResource(userResource);
  }

  logger.info('User created', { id: user.id, email });
  if (!existingUser) {
    passwordResetUrl = await resetPassword(systemRepo, user, 'invite');
  }

  // Upsert profile Resource (e.g. Patient or Practitioner)
  const profile = await upsertProfileResource(systemRepo, request);

  // Upsert ProjectMembership resource to connect User to profile resource in the given Project
  const membership = await upsertProjectMembership(systemRepo, request, project, user, profile);

  if (email && request.sendEmail !== false) {
    await sendInviteEmail(systemRepo, request, user, existingUser, passwordResetUrl);
  }

  return { user, profile, membership };
}

async function makeUserResource(request: ServerInviteRequest): Promise<User> {
  const { firstName, lastName, externalId, scope, mfaRequired } = request;
  const email = request.email?.toLowerCase();
  const password = request.password ?? generateSecret(16);
  const passwordHash = await bcryptHashPassword(password);

  // Default scoping: Patients are project-scoped, Practitioners/RelatedPersons are server-scoped.
  // Either default can be overridden with scope: 'project' | 'server'.
  // Users with an externalId are always project-scoped regardless of resourceType.
  let project: Reference<Project> | undefined = undefined;
  if ((request.resourceType === 'Patient' && scope !== 'server') || externalId || scope === 'project') {
    project = createReference(request.project);
  }

  let mfaSecret: string | undefined = undefined;
  if (mfaRequired) {
    mfaSecret = authenticator.generateSecret();
  }

  return {
    resourceType: 'User',
    meta: project ? { project: resolveId(project) } : undefined,
    firstName,
    lastName,
    email,
    passwordHash,
    project,
    mfaRequired,
    mfaSecret,
  };
}

async function upsertProfileResource(
  systemRepo: SystemRepository,
  request: ServerInviteRequest
): Promise<WithId<ProfileResource>> {
  if (request.membership?.profile) {
    const profile = await systemRepo.readReference(request.membership.profile);
    if (profile.meta?.project !== request.project.id) {
      throw new OperationOutcomeError(badRequest('Profile does not belong to project'));
    }
    if (profile.resourceType !== request.resourceType) {
      throw new OperationOutcomeError(badRequest('Profile resourceType does not match request'));
    }
    return profile;
  } else {
    const { resourceType, firstName, lastName, project, email, patient } = request;
    const resource = {
      resourceType,
      meta: {
        project: project.id,
      },
      name: [
        {
          given: [firstName],
          family: lastName,
        },
      ],
      telecom: email ? [{ system: 'email', use: 'work', value: email }] : undefined,
    } as ProfileResource;

    // RelatedPerson.patient is a required FHIR field. Validate and attach the
    // patient reference when one is provided. The requirement is only enforced
    // below, when a new RelatedPerson would actually be created.
    if (resourceType === 'RelatedPerson' && patient) {
      let referencedPatient: WithId<Patient>;
      try {
        referencedPatient = await systemRepo.readReference<Patient>(patient);
      } catch (err) {
        // Convert notFound into a descriptive badRequest, since a bad patient
        // reference in the request is a client error (consistent with access policies).
        if (err instanceof OperationOutcomeError && isNotFound(err.outcome)) {
          throw new OperationOutcomeError(badRequest(`Patient ${getReferenceString(patient)} does not exist`));
        }
        throw err;
      }
      if (referencedPatient.meta?.project !== project.id) {
        throw new OperationOutcomeError(badRequest('Patient does not belong to project'));
      }
      (resource as RelatedPerson).patient = createReference(referencedPatient);
    }

    if (email) {
      const filters = [
        {
          code: '_project',
          operator: Operator.EQUALS,
          value: project.id,
        },
        {
          code: 'email',
          operator: Operator.EQUALS,
          value: email,
        },
      ];

      // Inviting by email may match an existing profile (e.g. a previously
      // created RelatedPerson), in which case no patient is required. Only
      // enforce the patient requirement when a new RelatedPerson would be created.
      if (resourceType === 'RelatedPerson' && !patient) {
        // Search for up to 2 matches so duplicates are detected deterministically
        // rather than arbitrarily picking one (mirrors conditionalCreate).
        const matches = await systemRepo.searchResources<RelatedPerson>({ resourceType, filters, count: 2 });
        if (matches.length > 1) {
          throw new OperationOutcomeError(multipleMatches);
        }
        if (matches.length === 0) {
          throw new OperationOutcomeError(badRequest('Patient is required to create a RelatedPerson'));
        }
        return matches[0];
      }

      const { resource: result, outcome } = await systemRepo.conditionalCreate(resource, {
        resourceType,
        filters,
      });

      if (isCreated(outcome)) {
        getLogger().info('Profile created', {
          reference: getReferenceString(result),
          project: getReferenceString(project),
          email,
        });
      }
      return result;
    } else {
      // Without an email there is nothing to match against, so a new resource is
      // always created and the RelatedPerson patient requirement applies.
      if (resourceType === 'RelatedPerson' && !patient) {
        throw new OperationOutcomeError(badRequest('Patient is required to create a RelatedPerson'));
      }
      const profile = await systemRepo.createResource(resource);
      getLogger().info('Profile created', {
        reference: getReferenceString(profile),
        project: getReferenceString(project),
        email,
      });
      return profile;
    }
  }
}

/**
 * Validates that all access policy references exist and belong to the project.
 * Uses batch reading to validate all policies in a single database query.
 * @param systemRepo - The system repository.
 * @param request - The invite request containing access policy references.
 * @param project - The project to validate against.
 * @throws OperationOutcomeError if any access policy is invalid.
 */
async function validateAccessPolicies(
  systemRepo: SystemRepository,
  request: ServerInviteRequest,
  project: WithId<Project>
): Promise<void> {
  // Collect all access policy references
  const references: Reference<AccessPolicy>[] = [];

  if (request.accessPolicy) {
    references.push(request.accessPolicy);
  }

  if (Array.isArray(request.access)) {
    for (const access of request.access) {
      if (access.policy) {
        references.push(access.policy);
      }
    }
  }

  if (Array.isArray(request.membership?.access)) {
    for (const access of request.membership.access) {
      if (access.policy) {
        references.push(access.policy);
      }
    }
  }

  // If no references to validate, return early
  if (references.length === 0) {
    return;
  }

  // Batch read all access policies at once
  const results = await systemRepo.readReferences<AccessPolicy>(references);

  // Validate each result
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const reference = references[i];
    const policyRefString = getReferenceString(reference);

    if (result instanceof Error) {
      // Convert notFound errors to badRequest with specific message
      if (result instanceof OperationOutcomeError && isNotFound(result.outcome)) {
        throw new OperationOutcomeError(badRequest(`Access policy ${policyRefString} does not exist`));
      }
      // For other errors, rethrow
      throw result;
    }

    // Check if the access policy belongs to the project
    if (result.meta?.project && result.meta.project !== project.id) {
      throw new OperationOutcomeError(badRequest(`Access policy ${policyRefString} does not belong to this project`));
    }
  }
}

async function upsertProjectMembership(
  systemRepo: SystemRepository,
  request: ServerInviteRequest,
  project: WithId<Project>,
  user: WithId<User>,
  profile: WithId<ProfileResource>
): Promise<WithId<ProjectMembership>> {
  // Validate access policies before creating/updating membership
  await validateAccessPolicies(systemRepo, request, project);

  const partialMembership: Partial<ProjectMembership> = {
    externalId: request.externalId,
    accessPolicy: request.accessPolicy,
    access: request.access,
    admin: request.admin,
    invitedBy: tryGetRequestContext()?.authState?.membership?.user,
    ...request.membership,
  };

  // Patients only. RelatedPerson and Practitioner invites are unchanged.
  // Also applies on upsert when no policy is provided in the request.
  // Prefers defaultAccessPolicies over the legacy defaultPatientAccessPolicy field.
  if (request.resourceType === 'Patient' && !partialMembership.accessPolicy && !partialMembership.access?.length) {
    const defaultPolicy = project.defaultAccessPolicies?.find((p) => p.profileType === 'Patient');
    if (defaultPolicy) {
      partialMembership.accessPolicy = defaultPolicy.accessPolicy;
    } else if (project.defaultPatientAccessPolicy) {
      // Fallback to legacy field for backwards compatibility
      partialMembership.accessPolicy = project.defaultPatientAccessPolicy;
    }
  }

  // Apply default membership policy for RelatedPerson invites, with patient as a parameter.
  if (
    request.resourceType === 'RelatedPerson' &&
    !partialMembership.accessPolicy &&
    !partialMembership.access?.length
  ) {
    const defaultPolicy = project.defaultAccessPolicies?.find((p) => p.profileType === 'RelatedPerson');
    const patientRef = (profile as RelatedPerson).patient;
    if (defaultPolicy && patientRef) {
      partialMembership.access = [
        {
          policy: defaultPolicy.accessPolicy,
          parameter: [{ name: 'patient', valueReference: patientRef }],
        },
      ];
    }
  }

  // Apply default membership policy for Practitioner invites, based on whether the member is
  // an admin. Admins get the Admin default policy; everyone else gets the Practitioner default.
  if (request.resourceType === 'Practitioner' && !partialMembership.accessPolicy && !partialMembership.access?.length) {
    const profileType = partialMembership.admin ? 'Admin' : 'Practitioner';
    const defaultPolicy = project.defaultAccessPolicies?.find((p) => p.profileType === profileType);
    if (defaultPolicy) {
      partialMembership.accessPolicy = defaultPolicy.accessPolicy;
    }
  }

  if (request.forceNewMembership) {
    return createProjectMembership(systemRepo, user, project, profile, partialMembership);
  }

  // Upsert ProjectMembership resource to connect User to profile resource in the given Project
  const membership = await systemRepo.withTransaction(
    async (txRepo) => {
      const existingMembership = await searchForExistingMembership(txRepo, user, project);
      if (existingMembership) {
        if (!request.upsert) {
          throw new OperationOutcomeError(conflict('User is already a member of this project'));
        }

        if (existingMembership.profile?.reference !== getReferenceString(profile)) {
          throw new OperationOutcomeError(
            conflict('User is already a member of this project with a different profile')
          );
        }

        // Update the existing membership
        // Be careful to preserve the critical properties: id, project, user, and profile
        return txRepo.updateResource<ProjectMembership>({
          ...existingMembership,
          ...partialMembership,
          resourceType: 'ProjectMembership',
          id: existingMembership.id,
          project: createReference(project),
          user: createReference(user),
          profile: createReference(profile),
        });
      } else {
        return createProjectMembership(txRepo, user, project, profile, partialMembership);
      }
    },
    {
      resourceTypes: ['ProjectMembership', profile.resourceType],
      source: 'upsertProjectMembership',
      serializable: true,
    }
  );

  return membership;
}

async function searchForExistingMembership(
  systemRepo: SystemRepository,
  user: WithId<User>,
  project: WithId<Project>
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
  systemRepo: SystemRepository,
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
    await sendEmail(systemRepo, options, request.project);
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
