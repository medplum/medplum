import {
  badRequest,
  createReference,
  OperationOutcomeError,
  Operator,
  ProfileResource,
  resolveId,
} from '@medplum/core';
import { ContactPoint, Login, OperationOutcome, Project, ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import bcrypt from 'bcryptjs';
import { Handler, NextFunction, Request, Response } from 'express';
import fetch from 'node-fetch';
import { getConfig } from '../config';
import { getLogger } from '../context';
import { sendOutcome } from '../fhir/outcomes';
import { getSystemRepo } from '../fhir/repo';
import { rewriteAttachments, RewriteMode } from '../fhir/rewrite';
import { getClientApplication, getMembershipsForLogin } from '../oauth/utils';

export async function createProfile(
  project: Project,
  resourceType: 'Patient' | 'Practitioner' | 'RelatedPerson',
  firstName: string,
  lastName: string,
  email: string | undefined
): Promise<ProfileResource> {
  const logger = getLogger();
  logger.info('Creating profile', { resourceType, firstName, lastName });
  let telecom: ContactPoint[] | undefined = undefined;
  if (email) {
    telecom = [{ system: 'email', use: 'work', value: email }];
  }

  const systemRepo = getSystemRepo();
  const result = await systemRepo.createResource<ProfileResource>({
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
    telecom,
  } as ProfileResource);
  logger.info('Created profile', { id: result.id });
  return result;
}

export async function createProjectMembership(
  user: User,
  project: Project,
  profile: ProfileResource,
  details?: Partial<ProjectMembership>
): Promise<ProjectMembership> {
  const logger = getLogger();
  logger.info('Creating project membership', { name: project.name });

  const systemRepo = getSystemRepo();
  const result = await systemRepo.createResource<ProjectMembership>({
    ...details,
    resourceType: 'ProjectMembership',
    project: createReference(project),
    user: createReference(user),
    profile: createReference(profile),
  });
  logger.info('Created project memberships', { id: result.id });
  return result;
}

/**
 * Sends a login response to the client.
 * If the user has multiple profiles, sends the list of profiles to choose from.
 * Otherwise, sends the authorization code.
 * @param res - The response object.
 * @param login - The login details.
 */
export async function sendLoginResult(res: Response, login: Login): Promise<void> {
  const systemRepo = getSystemRepo();
  const user = await systemRepo.readReference<User>(login.user as Reference<User>);
  if (user.mfaEnrolled && login.authMethod === 'password' && !login.mfaVerified) {
    res.json({ login: login.id, mfaRequired: true });
    return;
  }

  if (login.project?.reference === 'Project/new') {
    // User is creating a new project.
    res.json({ login: login.id });
    return;
  }

  if (login.membership) {
    // User only has one profile, so proceed
    sendLoginCookie(res, login);
    res.json({
      login: login.id,
      code: login.code,
    });
    return;
  }

  // User has multiple profiles, so the user needs to select
  // Safe to rewrite attachments,
  // because we know that these are all resources that the user has access to
  const memberships = await getMembershipsForLogin(login);
  const redactedMemberships = memberships.map((m) => ({
    id: m.id,
    project: m.project,
    profile: m.profile,
  }));
  res.json(
    await rewriteAttachments(RewriteMode.PRESIGNED_URL, systemRepo, {
      login: login.id,
      memberships: redactedMemberships,
    })
  );
}

/**
 * Adds a login cookie to the response if this is a OAuth2 client login.
 * @param res - The response object.
 * @param login - The login details.
 */
export function sendLoginCookie(res: Response, login: Login): void {
  if (login.client) {
    const cookieName = 'medplum-' + resolveId(login.client);
    res.cookie(cookieName, login.cookie as string, {
      maxAge: 3600 * 1000,
      sameSite: 'none',
      secure: true,
      httpOnly: true,
    });
  }
}

/**
 * Verifies the recaptcha response from the client.
 * @param secretKey - The Recaptcha secret key to use for verification.
 * @param recaptchaToken - The Recaptcha response from the client.
 * @returns True on success, false on failure.
 */
export async function verifyRecaptcha(secretKey: string, recaptchaToken: string): Promise<boolean> {
  const url =
    'https://www.google.com/recaptcha/api/siteverify' +
    '?secret=' +
    encodeURIComponent(secretKey) +
    '&response=' +
    encodeURIComponent(recaptchaToken);

  const response = await fetch(url, { method: 'POST' });
  const json = (await response.json()) as { success: boolean };
  return json.success;
}

/**
 * Returns project ID if clientId is provided.
 * @param clientId - clientId from the client
 * @param projectId - projectId from the client
 * @returns The Project ID
 * @throws OperationOutcomeError
 */
export async function getProjectIdByClientId(
  clientId: string | undefined,
  projectId: string | undefined
): Promise<string | undefined> {
  // For OAuth2 flow, check the clientId
  if (clientId) {
    const client = await getClientApplication(clientId);
    const clientProjectId = client.meta?.project as string;
    if (projectId !== undefined && projectId !== clientProjectId) {
      throw new OperationOutcomeError(badRequest('Invalid projectId'));
    }
    return clientProjectId;
  }

  return projectId;
}

/**
 * Returns a project by recaptcha site key.
 * @param recaptchaSiteKey - reCAPTCHA site key from the client.
 * @param projectId - Optional project ID from the client.
 * @returns Project if found, otherwise undefined.
 */
export function getProjectByRecaptchaSiteKey(
  recaptchaSiteKey: string,
  projectId: string | undefined
): Promise<Project | undefined> {
  const filters = [
    {
      code: 'recaptcha-site-key',
      operator: Operator.EQUALS,
      value: recaptchaSiteKey,
    },
  ];

  if (projectId) {
    filters.push({
      code: '_id',
      operator: Operator.EQUALS,
      value: projectId,
    });
  }

  const systemRepo = getSystemRepo();
  return systemRepo.searchOne<Project>({ resourceType: 'Project', filters });
}

/**
 * Returns the bcrypt hash of the password.
 * @param password - The input password.
 * @returns The bcrypt hash of the password.
 */
export function bcryptHashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, getConfig().bcryptHashSalt);
}

export function validateRecaptcha(projectValidation?: (p: Project) => OperationOutcome | undefined): Handler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const recaptchaSiteKey = req.body.recaptchaSiteKey;
    const config = getConfig();
    let secretKey: string | undefined = config.recaptchaSecretKey;

    if (recaptchaSiteKey && recaptchaSiteKey !== config.recaptchaSiteKey) {
      // If the recaptcha site key is not the main Medplum recaptcha site key,
      // then it must be associated with a Project.
      // The user can only authenticate with that project.
      const project = await getProjectByRecaptchaSiteKey(recaptchaSiteKey, req.body.projectId);
      if (!project) {
        sendOutcome(res, badRequest('Invalid recaptchaSiteKey'));
        return;
      }
      secretKey = project.site?.find((s) => s.recaptchaSiteKey === recaptchaSiteKey)?.recaptchaSecretKey;
      if (!secretKey) {
        sendOutcome(res, badRequest('Invalid recaptchaSecretKey'));
        return;
      }

      const validationOutcome = projectValidation?.(project);
      if (validationOutcome) {
        sendOutcome(res, validationOutcome);
        return;
      }
    }

    if (secretKey) {
      if (!req.body.recaptchaToken) {
        sendOutcome(res, badRequest('Recaptcha token is required'));
        return;
      }

      if (!(await verifyRecaptcha(secretKey, req.body.recaptchaToken))) {
        sendOutcome(res, badRequest('Recaptcha failed'));
        return;
      }
    }
    next();
  };
}
