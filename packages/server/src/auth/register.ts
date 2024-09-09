import { createReference, ProfileResource } from '@medplum/core';
import { ClientApplication, Login, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { createProject } from '../fhir/operations/projectinit';
import { getSystemRepo } from '../fhir/repo';
import { getAuthTokens, getUserByEmailWithoutProject, tryLogin } from '../oauth/utils';
import { bcryptHashPassword } from './utils';

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
  readonly remoteAddress?: string;
  readonly userAgent?: string;
  readonly scope?: string;
}

export interface RegisterResponse {
  readonly accessToken: string;
  readonly user: User;
  readonly project: Project;
  readonly login: Login;
  readonly membership: ProjectMembership;
  readonly profile: ProfileResource;
  readonly client: ClientApplication;
}

/**
 * Registers a new user and/or new project.
 * @param request - The register request.
 * @returns The registration response.
 */
export async function registerNew(request: RegisterRequest): Promise<RegisterResponse> {
  const { password, projectName, firstName, lastName } = request;
  const email = request.email.toLowerCase();
  const passwordHash = await bcryptHashPassword(password);

  let user = await getUserByEmailWithoutProject(email);
  if (!user) {
    const systemRepo = getSystemRepo();
    user = await systemRepo.createResource<User>({
      resourceType: 'User',
      firstName,
      lastName,
      email,
      passwordHash,
    });
  }

  const login = await tryLogin({
    authMethod: 'password',
    scope: request.scope ?? 'openid offline',
    nonce: randomUUID(),
    email: email,
    password: password,
    remoteAddress: request.remoteAddress,
    userAgent: request.userAgent,
    allowNoMembership: true,
  });

  const { membership, client, project, profile } = await createProject(projectName, user);

  const token = await getAuthTokens(
    user,
    {
      ...login,
      membership: createReference(membership as ProjectMembership),
    },
    createReference(profile as ProfileResource),
    client.refreshTokenLifetime
  );

  return {
    accessToken: token.accessToken,
    user,
    project,
    login,
    membership: membership as ProjectMembership,
    profile: profile as ProfileResource,
    client,
  };
}
