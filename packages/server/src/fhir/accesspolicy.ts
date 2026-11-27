// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProfileResource, Token, WithId } from '@medplum/core';
import {
  badRequest,
  createReference,
  EMPTY,
  escapeSearchValue,
  getReferenceString,
  isNotFound,
  isObject,
  isResource,
  isResourceType,
  isString,
  OperationOutcomeError,
  projectAdminResourceTypes,
  readInteractions,
  resolveId,
  Tokenizer,
} from '@medplum/core';
import type {
  AccessPolicy,
  AccessPolicyIpAccessRule,
  AccessPolicyResource,
  Bot,
  ClientApplication,
  Expression,
  Project,
  ProjectMembership,
  ProjectMembershipAccess,
  ProjectMembershipAccessParameter,
  Reference,
} from '@medplum/fhirtypes';
import { getLogger } from '../logger';
import type { AuthState } from '../oauth/middleware';
import { escapeRegexString } from '../util/text';
import { membershipProfileTypes, readMembershipReference } from './projectmembership';
import type { SystemRepository } from './repo';
import { getGlobalSystemRepo, getProjectSystemRepo, Repository } from './repo';
import { PLACEHOLDER_SHARD_ID } from './sharding';
import { applySmartScopes, parseSmartScopes } from './smart';

export type PopulatedAccessPolicy = AccessPolicy & { resource: AccessPolicyResource[] };

const invalidAccessPolicyConfiguration = badRequest(
  'Cannot authenticate: Invalid access policy configuration. Please contact your administrator to update your project membership.'
);

export type ParameterValues = Map<string, string | undefined>;

/**
 * Creates a repository object for the user auth state.
 * Individual instances of the Repository class manage access rights to resources.
 * Login instances contain details about user compartments.
 * This method ensures that the repository is setup correctly.
 * @param authState - The authentication state.
 * @param extendedMode - Optional flag to enable extended mode for custom Medplum properties.
 * @param remoteAddress - Optional current request IP, used for AuditEvents instead of `login.remoteAddress`
 *   (which is only as fresh as the last token issuance/refresh).
 * @returns A repository configured for the login details.
 */
export async function getRepoForLogin(
  authState: AuthState,
  extendedMode?: boolean,
  remoteAddress?: string
): Promise<Repository> {
  const { login, membership: realMembership, onBehalfOfMembership, project: realProject } = authState;
  const membership = onBehalfOfMembership ?? realMembership;
  const accessPolicy = await getAccessPolicyForLogin(authState);

  let profile: WithId<ProfileResource | Bot | ClientApplication> | undefined = authState.profile;
  if (!profile) {
    try {
      // project system repo since not all ProfileResource types are global
      const realProjectSystemRepo = await getProjectSystemRepo(realProject);
      profile = await readMembershipReference<ProfileResource | Bot | ClientApplication>(
        realProjectSystemRepo,
        realMembership.project,
        realMembership.profile,
        membershipProfileTypes,
        { allowLinkedProjects: true }
      );
    } catch (err: unknown) {
      if (!(err instanceof OperationOutcomeError && isNotFound(err.outcome))) {
        throw err;
      }
    }
  }

  let project = realProject;
  let globalSystemRepo: SystemRepository | undefined;
  if (membership.project.reference !== realMembership.project.reference) {
    globalSystemRepo = getGlobalSystemRepo();
    project = await globalSystemRepo.readReference<Project>(membership.project);
  }

  const allowedProjects = await getAllowedProjects(project, globalSystemRepo);

  return new Repository({
    routing: { kind: 'project-shard', shardId: PLACEHOLDER_SHARD_ID },
    projects: allowedProjects,
    author: profile ? createReference(profile) : realMembership.profile,
    remoteAddress: remoteAddress ?? login.remoteAddress,
    superAdmin: project.superAdmin,
    projectAdmin: membership.admin,
    accessPolicy,
    strictMode: project.strictMode,
    extendedMode,
    checkReferencesOnWrite: project.checkReferencesOnWrite,
    validateTerminology: project.features?.includes('validate-terminology'),
    onBehalfOf: authState.onBehalfOf ? createReference(authState.onBehalfOf) : undefined,
    client: login.client,
  });
}

/**
 * Creates a repository that is limited to what a project may read: the project itself and the projects it links to.
 *
 * Use this instead of a `SystemRepository` to resolve references found in project content when there is
 * no user to act as, such as in unauthenticated endpoints and background jobs.
 * A `SystemRepository` can read every resource in every project, so it authorizes nothing.
 * @param projectId - The ID of the project.
 * @returns A repository scoped to the project.
 */
export async function getRepoForProject(projectId: string): Promise<Repository> {
  const globalSystemRepo = getGlobalSystemRepo();
  const project = await globalSystemRepo.readResource<Project>('Project', projectId);
  return getRepoForProjects(await getAllowedProjects(project, globalSystemRepo));
}

/**
 * Creates a repository that is limited to reading from the given projects, as in `getRepoForProject`.
 * @param projects - The current project, followed by any linked projects it may read from.
 * @returns A repository scoped to the projects.
 */
export function getRepoForProjects(projects: WithId<Project>[]): Repository {
  return new Repository({
    routing: { kind: 'project-shard', shardId: PLACEHOLDER_SHARD_ID },
    projects,
    author: { reference: 'system' },
    extendedMode: true,
  });
}

/**
 * Resolves a project and the projects it links to, which its members may read from.
 * @param project - The project whose links to resolve.
 * @param systemRepo - Optional system repository used to read projects
 * @returns The project followed by each linked project that could be read.
 */
export async function getAllowedProjects(
  project: WithId<Project>,
  systemRepo?: SystemRepository
): Promise<WithId<Project>[]> {
  const allowedProjects: WithId<Project>[] = [project];
  if (project.link) {
    const linkedProjectRefs: Reference<Project>[] = [];
    for (const link of project.link) {
      if (link.project) {
        linkedProjectRefs.push(link.project);
      }
    }

    const linkedProjectsOrError = await (systemRepo ?? getGlobalSystemRepo()).readReferences<Project>(
      linkedProjectRefs
    );
    for (let i = 0; i < linkedProjectsOrError.length; i++) {
      const linkedProjectOrError = linkedProjectsOrError[i];
      if (isResource(linkedProjectOrError)) {
        allowedProjects.push(linkedProjectOrError);
      } else {
        // Ignore missing; if a super admin creates a project link to a non-existent project,
        // searching it would be a no-op.
        getLogger().debug('Linked project not found', { project: linkedProjectRefs[i] });
      }
    }
  }
  return allowedProjects;
}

/**
 * Returns the access policy for the user auth state.
 * @param authState - The authentication state.
 * @returns The finalized access policy.
 */
export async function getAccessPolicyForLogin(authState: AuthState): Promise<AccessPolicy | undefined> {
  const { project, login } = authState;
  if (project.superAdmin && (login.launch || parseSmartScopes(login.scope).length > 0)) {
    // Super admin privileges are not limited by the access policy, so SMART scopes cannot narrow them
    throw new OperationOutcomeError(badRequest('SMART scopes are not supported for super admin logins'));
  }

  const membership = authState.onBehalfOfMembership ?? authState.membership;

  let accessPolicy = await buildAccessPolicy(membership);

  // Apply project admin access policies
  // This includes ensuring no admin rights for non-admins
  // and restricted access for admins
  accessPolicy = applyProjectAdminAccessPolicy(project, membership, accessPolicy);

  if (login.scope) {
    // If the login specifies SMART scopes,
    // then set the access policy to use those scopes.
    // Applied last so that the scopes also limit the project admin rules.
    accessPolicy = applySmartScopes(accessPolicy, authState);
  }

  if (!project.superAdmin) {
    // Only super admins can set Bot.system
    accessPolicy = applyBotSystemReadonly(accessPolicy);
  }

  return accessPolicy;
}

/**
 * Builds a parameterized compound access policy.
 * @param membership - The user project membership.
 * @returns The parameterized compound access policy.
 */
export async function buildAccessPolicy(membership: ProjectMembership): Promise<PopulatedAccessPolicy> {
  const access: ProjectMembershipAccess[] = [];
  if (membership.accessPolicy) {
    access.push({ policy: membership.accessPolicy });
  }
  if (membership.access) {
    access.push(...membership.access);
  }

  const systemRepo = await getProjectSystemRepo(membership.project);
  const projectIds = await getReadableProjectIds(systemRepo, membership, access);
  let compartment: Reference | undefined = undefined;
  const resourcePolicies: AccessPolicyResource[] = [];
  const ipAccessRules: AccessPolicyIpAccessRule[] = [];
  const accessPolicyMap = new Map<string, AccessPolicy>();
  for (const entry of access) {
    const replaced = await buildAccessPolicyResources(
      systemRepo,
      membership,
      entry,
      membership.profile as Reference<ProfileResource>,
      accessPolicyMap,
      projectIds
    );
    if (replaced.compartment) {
      compartment = replaced.compartment;
    }
    for (const resourcePolicy of replaced.resource ?? EMPTY) {
      if (!resourcePolicy.interaction && resourcePolicy.readonly) {
        resourcePolicy.interaction = ['search', 'read', 'history', 'vread'];
      }
      resourcePolicies.push(resourcePolicy);
    }
    if (replaced.ipAccessRule) {
      ipAccessRules.push(...replaced.ipAccessRule);
    }
  }

  if (!membership?.access?.length && !membership.accessPolicy) {
    // Preserve legacy behavior of null access policy
    // TODO: This should be removed in future release when access policies are required
    resourcePolicies.push({ resourceType: '*' });
  }

  addDefaultResourceTypes(resourcePolicies);

  return {
    resourceType: 'AccessPolicy',
    basedOn: access.map((a) => a.policy),
    compartment,
    resource: resourcePolicies,
    ipAccessRule: ipAccessRules.length ? ipAccessRules : undefined,
  };
}

async function getReadableProjectIds(
  systemRepo: SystemRepository,
  membership: ProjectMembership,
  access: ProjectMembershipAccess[]
): Promise<Set<string>> {
  const projectIds = new Set<string>();
  const projectId = resolveId(membership.project);
  if (projectId) {
    projectIds.add(projectId);
  }
  if (access.some((entry) => entry.parameter?.some((param) => param.valueReference))) {
    const project = await systemRepo.readReference<Project>(membership.project);
    for (const link of project.link ?? EMPTY) {
      const linkedProjectId = resolveId(link.project);
      if (linkedProjectId) {
        projectIds.add(linkedProjectId);
      }
    }
  }
  return projectIds;
}

/**
 * Reads an access policy and replaces all variables.
 * @param systemRepo - The system repository.
 * @param membership - The project membership that references the access policy.
 * @param access - The access policy and parameters.
 * @param profile - The user profile.
 * @param accessPolicyMap - Map of already-fetched access policies to avoid redundant lookups.
 * @param projectIds - The projects the membership can read, as from `getReadableProjectIds`.
 * @returns The AccessPolicy with variables resolved.
 */
async function buildAccessPolicyResources(
  systemRepo: SystemRepository,
  membership: ProjectMembership,
  access: ProjectMembershipAccess,
  profile: Reference<ProfileResource>,
  accessPolicyMap: Map<string, AccessPolicy>,
  projectIds: ReadonlySet<string>
): Promise<AccessPolicy> {
  const accessPolicyReference = access.policy;
  const policyReferenceString = getReferenceString(accessPolicyReference);
  if (!isString(policyReferenceString)) {
    throw new Error('Access policy reference is required');
  }

  let original = accessPolicyMap.get(policyReferenceString);
  if (!original) {
    try {
      original = await readMembershipReference(
        systemRepo,
        membership.project,
        accessPolicyReference,
        ['AccessPolicy'],
        {
          allowLinkedProjects: true,
        }
      );
      accessPolicyMap.set(policyReferenceString, original);
    } catch {
      // Intentionally catch and rethrow with a generic error message for security
      // (don't expose access policy details during login)
      throw new OperationOutcomeError(invalidAccessPolicyConfiguration);
    }
  }

  const values = getParameterValues(profile, access.parameter, projectIds);
  return substituteAccessPolicyParameters(original, values);
}

/**
 * Returns the values of the membership and built-in parameters. The first parameter with a given name wins.
 * @param profile - The membership profile.
 * @param parameters - The membership access parameters.
 * @param projectIds - The projects the membership can read. A reference parameter cannot have one as its ID.
 * @returns The parameter values by variable.
 */
export function getParameterValues(
  profile: Reference,
  parameters: ProjectMembershipAccessParameter[] | undefined,
  projectIds: ReadonlySet<string>
): ParameterValues {
  const values: ParameterValues = new Map();
  for (const param of parameters ?? EMPTY) {
    addParameter(values, param, projectIds);
  }
  addParameter(values, { name: 'profile', valueReference: profile }, projectIds);
  if (!parameters?.some((p) => p.name === 'patient')) {
    addParameter(values, { name: 'patient', valueReference: profile }, projectIds);
  }
  return values;
}

function addParameter(
  values: ParameterValues,
  param: ProjectMembershipAccessParameter,
  projectIds: ReadonlySet<string>
): void {
  const variable = `%${param.name}`;
  if (values.has(variable)) {
    return;
  }
  if (param.valueString) {
    values.set(variable, param.valueString);
  } else if (param.valueReference) {
    const parsed = parseReferenceParameter(param.valueReference.reference);
    // Compartment search matches on ID alone, and every resource in a project is in the project's compartment
    const valid = parsed && !projectIds.has(parsed.id) ? parsed : undefined;
    values.set(variable, valid?.reference);
    // An earlier parameter named `name.id` takes precedence
    if (!values.has(`${variable}.id`)) {
      values.set(`${variable}.id`, valid?.id);
    }
  }
}

const referenceIdPattern = /^[A-Za-z0-9-]{1,64}$/;
function parseReferenceParameter(reference: string | undefined): { reference: string; id: string } | undefined {
  const [resourceType, id, ...rest] = (reference ?? '').split('/');
  const isVersioned = rest.length === 2 && rest[0] === '_history';
  if ((rest.length === 0 || isVersioned) && isResourceType(resourceType) && id && referenceIdPattern.test(id)) {
    return { reference: `${resourceType}/${id}`, id };
  }
  return undefined;
}

interface Substitution {
  pattern: RegExp;
  values: ParameterValues;
}

function getVariablePattern(variables: Iterable<string>): RegExp {
  // Longest first, so that `%org.id` is matched before `%org`. Escaping keeps a prefix a prefix.
  const names = Array.from(variables, (variable) => escapeRegexString(variable.slice(1)));
  names.sort((a, b) => b.length - a.length);
  return new RegExp(`%(?:${names.join('|')})`, 'g');
}

/**
 * Fields of an element that are not replaced as plain strings, by key. Each applies only at the level of its
 * element, so that e.g. an `expression` in an extension or a `compartment` in a contained resource is plain.
 */
type FieldSubstitution<T extends object> = {
  readonly [K in keyof T]?: (value: Exclude<T[K], undefined>, substitution: Substitution) => T[K];
};

const plainFields: FieldSubstitution<Record<string, unknown>> = {};
const expressionFields: FieldSubstitution<Expression> = { expression: substituteFhirPath };
const resourcePolicyFields: FieldSubstitution<AccessPolicyResource> = {
  compartment: substituteCompartment,
  criteria: substituteCriteria,
  writeConstraint: (constraints, substitution) =>
    constraints.map((constraint) => substituteFields(constraint, substitution, expressionFields)),
};
const accessPolicyFields: FieldSubstitution<AccessPolicy> = {
  compartment: substituteCompartment,
  resource: (resource, substitution) =>
    resource.map((resourcePolicy) => substituteFields(resourcePolicy, substitution, resourcePolicyFields)),
};

/**
 * Replaces the parameter variables in an access policy.
 * Search criteria values are escaped, and compartments must be relative references once replaced.
 * @param policy - The access policy, which is not modified. Returned as is if there are no parameter values.
 * @param values - The parameter values by variable. Every variable must start with `%`.
 * @returns A copy of the access policy with the variables replaced.
 */
export function substituteAccessPolicyParameters(policy: AccessPolicy, values: ParameterValues): AccessPolicy {
  if (values.size === 0) {
    return policy;
  }
  return substituteFields(policy, { pattern: getVariablePattern(values.keys()), values }, accessPolicyFields);
}

function substituteFields<T extends object>(value: T, substitution: Substitution, fields: FieldSubstitution<T>): T {
  const substituters = fields as Readonly<Record<string, (value: unknown, substitution: Substitution) => unknown>>;
  const entries = Object.entries(value);
  for (const entry of entries) {
    // Own keys only, so that a stored key such as `constructor` is not looked up on the prototype
    const substitute =
      entry[1] !== undefined && Object.hasOwn(substituters, entry[0]) ? substituters[entry[0]] : substituteValue;
    entry[1] = substitute(entry[1], substitution);
  }
  // Object.fromEntries defines own properties, so a stored `__proto__` key cannot set the prototype
  return Object.fromEntries(entries) as T;
}

function substituteValue(value: unknown, substitution: Substitution): unknown {
  if (typeof value === 'string') {
    // Function replacer so that `$` patterns in the value are inserted literally
    return value.includes('%')
      ? value.replace(substitution.pattern, (variable) => getValue(substitution, variable))
      : value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => substituteValue(v, substitution));
  }
  if (isObject(value)) {
    return substituteFields(value, substitution, plainFields);
  }
  return value;
}

function substituteCompartment(compartment: Reference, substitution: Substitution): Reference {
  const result = substituteValue(compartment, substitution) as Reference;
  if (!result.reference || parseReferenceParameter(result.reference)?.reference !== result.reference) {
    throw new OperationOutcomeError(invalidAccessPolicyConfiguration);
  }
  return result;
}

function substituteCriteria(criteria: string, substitution: Substitution): string {
  const queryStart = criteria.indexOf('?') + 1;
  // Values are inserted after splitting, so only the policy as written separates the search parameters
  const query = criteria
    .slice(queryStart)
    .split('&')
    .map((param) => {
      if (!param.includes('%')) {
        return param;
      }
      const valueStart = param.indexOf('=') + 1;
      const isFilter = valueStart > 0 && new URLSearchParams(param.slice(0, valueStart)).has('_filter');
      return param.replace(substitution.pattern, (variable) => {
        const value = getValue(substitution, variable);
        return encodeURIComponent(isFilter ? value : escapeSearchValue(value));
      });
    })
    .join('&');
  return criteria.slice(0, queryStart) + query;
}

function substituteFhirPath(expression: string, substitution: Substitution): string {
  // Tokenized on the first match, since most `%` variables are built-ins such as `%resource`
  let tokens: Token[] | null | undefined;
  return expression.replace(substitution.pattern, (variable: string, offset: number) => {
    if (tokens === undefined) {
      try {
        // Keywords and operators do not affect where strings, symbols, and comments start
        tokens = new Tokenizer(expression, [], []).tokenize();
      } catch {
        // The expression is invalid as written, so it will fail when evaluated
        tokens = null;
      }
    }
    if (tokens === null) {
      return variable;
    }
    const token = tokens.findLast((t) => t.index <= offset);
    // The tokenizer includes the quoted unit of a quantity, such as `4 'mg'`, in its token
    if (token?.id === 'String' || token?.id === 'Quantity' || (token && expression[token.index] === '`')) {
      return escapeFhirPathString(getValue(substitution, variable));
    }
    const end = offset + variable.length;
    if (token?.id === 'Symbol' && token.index === offset && !/[$\w%]/.test(expression.charAt(end))) {
      return `'${escapeFhirPathString(getValue(substitution, variable))}'`;
    }
    return variable;
  });
}

function escapeFhirPathString(value: string): string {
  return value.replaceAll(/[\\'"`]/g, String.raw`\$&`);
}

function getValue(substitution: Substitution, variable: string): string {
  const value = substitution.values.get(variable);
  if (value === undefined) {
    throw new OperationOutcomeError(invalidAccessPolicyConfiguration);
  }
  return value;
}

/**
 * Adds default resource types to the access policy.
 * Once upon a time, all users automatically had access to "system" resource types such as StructureDefinition.
 * But now, users must have explicit access to these resource types.
 * Unfortunately, there are many clients that depend on this behavior.
 * So, we add these resource types to the access policy if they are not already present.
 * @param resourcePolicies - The existing set of resource policies.
 */
function addDefaultResourceTypes(resourcePolicies: AccessPolicyResource[]): void {
  const defaultResourceTypes = ['SearchParameter', 'StructureDefinition'];
  for (const resourceType of defaultResourceTypes) {
    if (!resourcePolicies.some((r) => r.resourceType === resourceType)) {
      resourcePolicies.push({
        resourceType,
        readonly: true,
      });
    }
  }
}

/**
 * Returns a write constraint that requires a new resource's `project` element, if present, to be the admin's own Project.
 * Updates are covered by `readonlyFields`, which restores `project` from the previous version.
 * @param membership - The project admin's membership.
 * @returns The write constraint expression.
 */
function ownProjectWriteConstraint(membership: ProjectMembership): Expression {
  return {
    language: 'text/fhirpath',
    expression: `%before.exists() or project.empty() or project.reference = 'Project/${resolveId(membership.project)}'`,
  };
}

/**
 * Updates the access policy to include project admin rules.
 * This includes ensuring no admin rights for non-admins and restricted access for admins.
 * @param project - The project.
 * @param membership - The active project membership.
 * @param accessPolicy - The existing access policy.
 * @returns Updated access policy with all project admin rules applied.
 */
function applyProjectAdminAccessPolicy(
  project: Project,
  membership: ProjectMembership,
  accessPolicy: PopulatedAccessPolicy
): PopulatedAccessPolicy {
  if (project.superAdmin) {
    for (const adminResourceType of projectAdminResourceTypes) {
      if (!accessPolicy.resource.some((r) => r.resourceType === adminResourceType)) {
        accessPolicy.resource.push({ resourceType: adminResourceType });
      }
    }
  } else if (membership.admin) {
    // If the user is a project admin,
    // then grant limited access to the project admin resource types
    accessPolicy.resource = accessPolicy.resource?.filter((r) => !projectAdminResourceTypes.includes(r.resourceType));

    // Project admins can edit their own project
    accessPolicy.resource.push(
      {
        resourceType: 'AccessPolicy',
        criteria: `AccessPolicy?_project=${resolveId(membership.project)}`,
      },
      {
        // Project admins have full access to their own project, except for a few sensitive fields
        resourceType: 'Project',
        criteria: `Project?_id=${resolveId(membership.project)}`,
        readonlyFields: ['active', 'features', 'link', 'systemSetting'],
        hiddenFields: ['superAdmin', 'systemSecret', 'strictMode'],
        interaction: ['read', 'vread', 'update', 'history', 'create', 'search'], // Everything except delete
      },
      {
        // Project admins have read-only access to linked projects, and cannot see sensitive fields
        resourceType: 'Project',
        hiddenFields: ['superAdmin', 'setting', 'systemSetting', 'secret', 'systemSecret', 'strictMode'],
        interaction: ['read', 'vread', 'history', 'search'], // Read-only access to linked projects
      },
      {
        resourceType: 'ProjectMembership',
        criteria: `ProjectMembership?_project=${resolveId(membership.project)}`,
        readonlyFields: ['project', 'user'],
        writeConstraint: [ownProjectWriteConstraint(membership)],
      },
      {
        resourceType: 'UserSecurityRequest',
        criteria: `UserSecurityRequest?_project=${resolveId(membership.project)}`,
        readonly: true,
      },
      {
        resourceType: 'User',
        criteria: `User?_project=${resolveId(membership.project)}`,
        hiddenFields: ['passwordHash', 'mfaSecret'],
        readonlyFields: ['email', 'emailVerified', 'mfaEnrolled', 'project'],
        writeConstraint: [ownProjectWriteConstraint(membership)],
      },
      {
        resourceType: 'Cron',
        criteria: `Cron?_project=${resolveId(membership.project)}`,
      },
      {
        resourceType: 'Package',
        readonly: true,
      },
      {
        resourceType: 'PackageRelease',
        readonly: true,
      },
      {
        resourceType: 'PackageInstallation',
        readonly: true,
      }
    );
  } else {
    // Preserve policy reads, including wildcard grants, but never grant non-admins policy writes.
    const policyReadRules = accessPolicy.resource
      .filter((r) => r.resourceType === 'AccessPolicy' || r.resourceType === '*')
      .map((r) => ({
        ...r,
        resourceType: 'AccessPolicy',
        criteria: r.criteria?.replace(/^\*\?/, 'AccessPolicy?'),
        interaction: r.interaction?.filter((i) => readInteractions.includes(i)) ?? [...readInteractions],
      }));

    accessPolicy.resource = accessPolicy.resource.filter((r) => !projectAdminResourceTypes.includes(r.resourceType));
    accessPolicy.resource.push(...policyReadRules);
  }

  return accessPolicy;
}

/**
 * Makes `Bot.system` readonly for every entry that can write a Bot.
 * Applied after SMART scopes, which can turn wildcard entries into Bot entries.
 * @param accessPolicy - The access policy.
 * @returns The access policy with `Bot.system` readonly.
 */
function applyBotSystemReadonly(accessPolicy: PopulatedAccessPolicy): PopulatedAccessPolicy {
  accessPolicy.resource = accessPolicy.resource.flatMap((r) => {
    if (r.resourceType === 'Bot') {
      return [withReadonlyField(r, 'system')];
    }
    if (r.resourceType === '*') {
      // The first matching entry applies, so a wildcard grant gets a Bot entry ahead of it
      const botEntry: AccessPolicyResource = { ...r, resourceType: 'Bot' };
      if (r.criteria) {
        botEntry.criteria = r.criteria.replace(/^\*\?/, 'Bot?');
      }
      return [withReadonlyField(botEntry, 'system'), r];
    }
    return [r];
  });
  return accessPolicy;
}

function withReadonlyField(entry: AccessPolicyResource, field: string): AccessPolicyResource {
  if (entry.readonlyFields?.includes(field) || entry.hiddenFields?.includes(field)) {
    return entry;
  }
  return { ...entry, readonlyFields: [...(entry.readonlyFields ?? []), field] };
}
