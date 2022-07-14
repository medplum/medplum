import { assertOk, createReference, ProfileResource } from '@medplum/core';
import { ClientApplication, Project, ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { systemRepo } from '../fhir';
import { getAuthTokens, tryLogin } from '../oauth';
import { createProject } from './newproject';

/*
 * This is a utility method for creating a Project, Profile, and ProjectMembership.
 * It is used by the server on first run in the "seeder" flow.
 * It is also used by many tests for creating isolated projects.
 */

export interface RegisterRequest {
  readonly firstName: string;
  readonly lastName: string;
  readonly projectName: string;
  readonly email: string;
  readonly password: string;
  readonly admin?: boolean;
}

export interface RegisterResponse {
  readonly accessToken: string;
  readonly user: User;
  readonly project: Project;
  readonly membership: ProjectMembership;
  readonly profile: ProfileResource;
  readonly client?: ClientApplication;
}

/**
 * Registers a new user and/or new project.
 * @param request The register request.
 * @returns The registration response.
 */
export async function registerNew(request: RegisterRequest): Promise<RegisterResponse> {
  const { email, password, projectName, firstName, lastName } = request;
  const passwordHash = await bcrypt.hash(password, 10);
  const [userOutcome, user] = await systemRepo.createResource<User>({
    resourceType: 'User',
    email,
    passwordHash,
  });
  assertOk(userOutcome, user);

  const [loginOutcome, login] = await tryLogin({
    authMethod: 'password',
    scope: 'openid',
    nonce: randomUUID(),
    email: request.email,
    password: request.password,
    remember: true,
  });
  assertOk(loginOutcome, login);

  const membership = await createProject(login, projectName, firstName, lastName);

  const [projectOutcome, project] = await systemRepo.readReference<Project>(membership.project as Reference<Project>);
  assertOk(projectOutcome, project);

  const [profileOutcome, profile] = await systemRepo.readReference<ProfileResource>(
    membership.profile as Reference<ProfileResource>
  );
  assertOk(profileOutcome, profile);

  const [tokenOutcome, token] = await getAuthTokens(
    {
      ...login,
      membership: createReference(membership),
    },
    createReference(profile)
  );
  assertOk(tokenOutcome, token);

  return {
    accessToken: token.accessToken,
    user,
    project,
    membership,
    profile,
  };
}
