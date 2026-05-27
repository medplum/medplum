// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProfileResource, WithId } from '@medplum/core';
import { badRequest, createReference, OperationOutcomeError, Operator, resolveId } from '@medplum/core';
import type {
  ContactPoint,
  Login,
  OperationOutcome,
  Project,
  ProjectMembership,
  Reference,
  User,
} from '@medplum/fhirtypes';
import bcrypt from 'bcrypt';
import type { Handler, NextFunction, Request, Response } from 'express';
import fetch from 'node-fetch';
import { randomInt } from 'node:crypto';
import { authenticator } from 'otplib';
import { toDataURL } from 'qrcode';
import { getConfig } from '../config/loader';
import { EMAIL_MFA_CODE_EXPIRATION_MS } from '../constants';
import { sendEmail } from '../email/email';
import { sendOutcome } from '../fhir/outcomes';
import type { SystemRepository } from '../fhir/repo';
import { getGlobalSystemRepo, getShardSystemRepo } from '../fhir/repo';
import { rewriteAttachments, RewriteMode } from '../fhir/rewrite';
import { TODO_SHARD_ID } from '../fhir/sharding';
import { getLogger } from '../logger';
import { getClientApplication, getMembershipsForLogin } from '../oauth/utils';

export type MfaMethod = 'totp' | 'email';

/**
 * Returns the MFA methods that a project allows users to enroll in.
 * Controlled by the `allowedMfaMethods` project setting, a comma-delimited
 * string (e.g. "totp", "email", or "totp,email"). When unset, only TOTP
 * authenticator enrollment is offered, preserving the historical behavior.
 * @param project - The project to read the setting from.
 * @returns The list of allowed MFA methods.
 */
export function getAllowedMfaMethods(project: Project | undefined): MfaMethod[] {
  const value = project?.setting?.find((s) => s.name === 'allowedMfaMethods')?.valueString;
  if (!value) {
    return ['totp'];
  }
  const methods = value
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is MfaMethod => s === 'totp' || s === 'email');
  return methods.length > 0 ? methods : ['totp'];
}

/**
 * Returns the MFA methods that a user has enrolled in.
 * Existing users enrolled before the introduction of `User.mfaMethod` are
 * treated as TOTP, which was the only method at the time.
 * @param user - The user.
 * @returns The list of enrolled MFA methods, or an empty array if not enrolled.
 */
export function getEnrolledMfaMethods(user: User): MfaMethod[] {
  if (user.mfaMethod && user.mfaMethod.length > 0) {
    return user.mfaMethod;
  }
  return user.mfaEnrolled ? ['totp'] : [];
}

/**
 * Generates a single-use 6-digit code for email-based MFA, stores a hash of it
 * (along with its expiration time) on the login, and emails the code to the user.
 * The code is cleared once it is verified (see verifyMfaToken).
 * @param login - The login to attach the hashed code to.
 * @param user - The user to email.
 */
export async function sendMfaEmailCode(login: WithId<Login>, user: User): Promise<void> {
  const systemRepo = getGlobalSystemRepo();
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const codeHash = await bcryptHashPassword(code);
  const expiresAt = new Date(Date.now() + EMAIL_MFA_CODE_EXPIRATION_MS).toISOString();
  await systemRepo.updateResource<Login>({ ...login, emailMfa: { codeHash, expiresAt } });
  const expirationMinutes = Math.round(EMAIL_MFA_CODE_EXPIRATION_MS / 60_000);
  await sendEmail(systemRepo, {
    to: user.email,
    subject: `Your Medplum verification code: ${code}`,
    text: [
      'Below is your requested Medplum verification code. You can copy it into the open browser window to confirm your login.',
      '',
      code,
      '',
      `This code will expire in ${expirationMinutes} minutes. If you did not try to sign in, you can safely ignore this email.`,
      '',
      'Thank you,',
      'The Medplum Team',
      '',
    ].join('\n'),
  });
}

export async function createProfile(
  systemRepo: SystemRepository,
  project: Project,
  resourceType: 'Patient' | 'Practitioner' | 'RelatedPerson',
  firstName: string,
  lastName: string,
  email: string | undefined
): Promise<WithId<ProfileResource>> {
  const logger = getLogger();
  logger.info('Creating profile', { resourceType, firstName, lastName });
  let telecom: ContactPoint[] | undefined = undefined;
  if (email) {
    telecom = [{ system: 'email', use: 'work', value: email }];
  }

  const result = await systemRepo.createResource({
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
  systemRepo: SystemRepository,
  user: User,
  project: Project,
  profile: ProfileResource,
  details?: Partial<ProjectMembership>
): Promise<WithId<ProjectMembership>> {
  const logger = getLogger();
  logger.info('Creating project membership', { name: project.name });

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
 * Reads the project associated with a login, if one is set.
 * @param login - The login resource.
 * @returns The project, or undefined if the login has no concrete project.
 */
async function getLoginProject(login: Login): Promise<Project | undefined> {
  const reference = login.project?.reference;
  if (!reference || reference === 'Project/new') {
    return undefined;
  }
  try {
    return await getGlobalSystemRepo().readReference<Project>(login.project as Reference<Project>);
  } catch {
    return undefined;
  }
}

/**
 * Sends a login response to the client.
 * If the user has multiple profiles, sends the list of profiles to choose from.
 * Otherwise, sends the authorization code.
 * @param res - The response object.
 * @param login - The login details.
 */
export async function sendLoginResult(res: Response, login: Login): Promise<void> {
  const systemRepo = getGlobalSystemRepo();
  const user = await systemRepo.readReference<User>(login.user as Reference<User>);

  if (user.mfaRequired && !user.mfaEnrolled && login.authMethod === 'password' && !login.mfaVerified) {
    const accountName = `Medplum - ${user.email}`;
    const issuer = 'medplum.com';
    const secret = user.mfaSecret as string;
    const otp = authenticator.keyuri(accountName, issuer, secret);
    res.json({
      login: login.id,
      mfaEnrollRequired: true,
      enrollUri: otp,
      enrollQrCode: await toDataURL(otp),
      allowedMfaMethods: getAllowedMfaMethods(await getLoginProject(login)),
    });
    return;
  }

  if (user.mfaEnrolled && login.authMethod === 'password' && !login.mfaVerified) {
    const mfaMethods = getEnrolledMfaMethods(user);
    // If email is the user's only MFA method, send the verification code
    // immediately so they can enter it without any further interaction. A set
    // emailMfa means a code has already been issued for this login, so
    // don't re-send (e.g. when the login status endpoint is queried again).
    if (mfaMethods.length === 1 && mfaMethods[0] === 'email' && !login.emailMfa) {
      await sendMfaEmailCode(login as WithId<Login>, user);
    }
    res.json({ login: login.id, mfaRequired: true, mfaMethods, email: user.email });
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
    identifier: m.identifier,
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
): Promise<WithId<Project> | undefined> {
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

  const systemRepo = getShardSystemRepo(TODO_SHARD_ID); // not shard ready; would require searching all shards
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
