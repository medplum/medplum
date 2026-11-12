// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/*
 * Parse HL7 SMART scope strings.
 * https://build.fhir.org/ig/HL7/smart-app-launch/scopes-and-launch-context.html
 */

import {
  badRequest,
  ContentType,
  deepClone,
  EMPTY,
  OAuthGrantType,
  OAuthSigningAlgorithm,
  OAuthTokenAuthMethod,
  OperationOutcomeError,
  projectAdminResourceTypes,
  readInteractions,
  splitN,
} from '@medplum/core';
import type { AccessPolicy, AccessPolicyResource, Login, Reference } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { getConfig } from '../config/loader';
import type { AuthState } from '../oauth/middleware';
import { getProjectScopedUrl } from '../util/url';
import type { PopulatedAccessPolicy } from './accesspolicy';

export const SMART_SCOPES_SUPPORTED = [
  'patient/*.rs',
  'user/*.cruds',
  'openid',
  'fhirUser',
  'launch',
  'launch/patient',
  'offline_access',
  'online_access',
];

const smartScopeFormat = /^(patient|user|system)\/(\w+|\*)\.(read|write|c?r?u?d?s?|\*)$/;

const missingPatientContext = 'Missing patient context for patient/ scope';

// `Type/id`, with the FHIR id format; excludes search syntax such as `,` (OR) and `\` (escape)
const literalReferenceFormat = /^[A-Z][A-Za-z]*\/[A-Za-z0-9\-.]{1,64}$/;

export interface SmartScope {
  readonly permissionType: 'patient' | 'user' | 'system';
  readonly resourceType: string;
  readonly scope: string;
  readonly params?: [string, string][];
}

/**
 * Handles requests for the SMART configuration.
 * See: https://build.fhir.org/ig/HL7/smart-app-launch/conformance.html
 * See: https://build.fhir.org/ig/HL7/smart-app-launch/scopes-and-launch-context.html
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 */
export function smartConfigurationHandler(req: Request, res: Response): void {
  const config = getConfig();
  res
    .status(200)
    .contentType(ContentType.JSON)
    .json({
      issuer: getProjectScopedUrl(req.originalUrl, config.issuer),
      jwks_uri: getProjectScopedUrl(req.originalUrl, config.baseUrl, config.jwksUrl),
      authorization_endpoint: getProjectScopedUrl(req.originalUrl, config.baseUrl, config.authorizeUrl),
      grant_types_supported: [
        OAuthGrantType.ClientCredentials,
        OAuthGrantType.AuthorizationCode,
        OAuthGrantType.RefreshToken,
        OAuthGrantType.TokenExchange,
      ],
      token_endpoint: getProjectScopedUrl(req.originalUrl, config.baseUrl, config.tokenUrl),
      token_endpoint_auth_methods_supported: [
        OAuthTokenAuthMethod.ClientSecretBasic,
        OAuthTokenAuthMethod.ClientSecretPost,
        OAuthTokenAuthMethod.PrivateKeyJwt,
      ],
      token_endpoint_auth_signing_alg_values_supported: [
        OAuthSigningAlgorithm.RS256,
        OAuthSigningAlgorithm.RS384,
        OAuthSigningAlgorithm.ES384,
      ],
      scopes_supported: SMART_SCOPES_SUPPORTED,
      response_types_supported: ['code'],
      introspection_endpoint: getProjectScopedUrl(req.originalUrl, config.baseUrl, config.introspectUrl),
      capabilities: [
        'authorize-post',
        'permission-v1',
        'permission-v2',
        'client-confidential-asymmetric',
        'client-confidential-symmetric',
        'client-public',
        'context-banner',
        'context-ehr-patient',
        'context-ehr-encounter',
        'context-standalone-patient',
        'context-style',
        'launch-ehr',
        'launch-standalone',
        'permission-offline',
        'permission-patient',
        'permission-user',
        'sso-openid-connect',
      ],
      code_challenge_methods_supported: ['S256'],
    });
}

/**
 * Handles requests for the SMART App Styling.
 * See: https://build.fhir.org/ig/HL7/smart-app-launch/scopes-and-launch-context.html#styling
 * @param _req - The HTTP request.
 * @param res - The HTTP response.
 */
export function smartStylingHandler(_req: Request, res: Response): void {
  res.status(200).contentType(ContentType.JSON).json({
    color_background: '#edeae3',
    color_error: '#9e2d2d',
    color_highlight: '#69b5ce',
    color_modal_backdrop: '',
    color_success: '#498e49',
    color_text: '#303030',
    dim_border_radius: '6px',
    dim_font_size: '13px',
    dim_spacing_size: '20px',
    font_family_body: "Georgia, Times, 'Times New Roman', serif",
    font_family_heading: "'HelveticaNeue-Light', Helvetica, Arial, 'Lucida Grande', sans-serif;",
  });
}

/**
 * Parses an OAuth scope string into a list of SMART scopes.
 * Only includes SMART scopes, all other scopes are ignored.
 * @param scope - The OAuth scope string.
 * @returns Array of SMART scopes.
 */
export function parseSmartScopes(scope: string | undefined): SmartScope[] {
  const result: SmartScope[] = [];

  for (const scopeTerm of scope?.split(' ') ?? EMPTY) {
    const parsed = parseSmartScopeString(scopeTerm);
    if (parsed) {
      result.push(parsed);
    }
  }

  return result;
}

/**
 * Returns true if the login is limited by SMART resource scopes (e.g. `patient/Observation.rs`).
 * @param login - The login, or the session of an authenticated request.
 * @returns True if the login has SMART resource scopes.
 */
export function hasSmartResourceScopes(login: Pick<Login, 'scope'>): boolean {
  return parseSmartScopes(login.scope).length > 0;
}

export function parseSmartScopeString(scope: string): SmartScope | undefined {
  const [baseScope, query] = splitN(scope, '?', 2);
  const match = smartScopeFormat.exec(baseScope);

  if (!match) {
    return undefined;
  }

  const params = query ? [...new URLSearchParams(query)] : [];

  return {
    permissionType: match[1] as 'patient' | 'user' | 'system',
    resourceType: match[2],
    scope: normalizeV2ScopeString(match[3]),
    params: params.length > 0 ? params : undefined,
  };
}

/**
 * Returns the SMART scopes whose combined permissions, per permission type and resource type, are
 * neither read-only (`rs`) nor full access (`cruds`).
 * @param scope - The OAuth scope string.
 * @returns The partial permission scopes, such as `patient/Observation.cs`.
 */
export function getPartialPermissionScopes(scope: string | undefined): string[] {
  const permissions = new Map<string, Set<string>>();
  for (const smartScope of parseSmartScopes(scope)) {
    const key = `${smartScope.permissionType}/${smartScope.resourceType}`;
    let letters = permissions.get(key);
    if (!letters) {
      letters = new Set<string>();
      permissions.set(key, letters);
    }
    for (const letter of smartScope.scope) {
      letters.add(letter);
    }
  }

  const result: string[] = [];
  for (const [key, letters] of permissions) {
    // Wildcard scopes also apply to each concrete resource type of the same permission type
    const wildcard = permissions.get(key.split('/')[0] + '/*');
    const combined = [...'cruds'].filter((letter) => letters.has(letter) || wildcard?.has(letter)).join('');
    if (combined !== 'rs' && combined !== 'cruds') {
      result.push(`${key}.${combined}`);
    }
  }
  return result;
}

function normalizeV2ScopeString(str: string): string {
  switch (str) {
    case '*':
      return 'cruds';
    case 'read':
      return 'rs';
    case 'write':
      return 'cud';
    default:
      return str;
  }
}

/**
 * Applies SMART scopes to an AccessPolicy.
 * If there are no SMART scopes, the AccessPolicy is returned unmodified.
 * Otherwise, each resource entry of the AccessPolicy is narrowed by each matching SMART scope,
 * producing one output entry per (entry, scope) pair; entries matching no SMART scope are removed.
 * Narrowing only adds search filters or removes interactions, so it never widens access.
 * @param accessPolicy - The original access policy.
 * @param authState - The user's authentication state.
 * @returns Updated access policy with the OAuth scope(s) applied.
 */
export function applySmartScopes(accessPolicy: PopulatedAccessPolicy, authState: AuthState): PopulatedAccessPolicy {
  const scope = authState.login.scope;
  const smartScopes = parseSmartScopes(scope);
  if (smartScopes.length === 0) {
    // No SMART scopes, so no changes to the access policy
    return accessPolicy;
  }
  const context = getPatientContext(authState);
  if (!context && smartScopes.some((scope) => scope.permissionType === 'patient')) {
    // `patient/` scopes are scoped to a single patient compartment, which cannot be resolved without a context
    throw new OperationOutcomeError(badRequest(missingPatientContext));
  }

  // Build an access policy that is the intersection of the existing access policy and the SMART scopes
  return intersectSmartScopes(accessPolicy, smartScopes, context);
}

/**
 * Resolves the Patient context for the login, from the SMART App Launch context or the user's own profile.
 * @param authState - The user's authentication state.
 * @returns The Patient context reference string, if a valid one is available.
 */
function getPatientContext(authState: AuthState): string | undefined {
  const membership = authState.onBehalfOfMembership ?? authState.membership;
  for (const candidate of [authState.smartAppLaunch?.patient, membership.profile]) {
    const reference = getLiteralReference(candidate);
    if (reference?.startsWith('Patient/')) {
      return reference;
    }
  }
  return undefined;
}

/**
 * Returns the reference string if it is a single literal `Type/id` reference, which is safe to use as a search value.
 * Any other string could be parsed as search syntax, e.g. `Patient/a,Patient/b` would match either Patient.
 * @param reference - The reference to check.
 * @returns The reference string, or undefined if it is not a single literal reference.
 */
function getLiteralReference(reference: Reference | undefined): string | undefined {
  const value = reference?.reference;
  return value && literalReferenceFormat.test(value) ? value : undefined;
}

function intersectSmartScopes(
  accessPolicy: AccessPolicy,
  smartScopes: SmartScope[],
  context?: string
): PopulatedAccessPolicy {
  const result: PopulatedAccessPolicy = { ...accessPolicy, resource: [] };
  for (const entry of accessPolicy.resource ?? EMPTY) {
    const isWildcard = entry.resourceType === '*';
    // A wildcard entry is expanded to each scope's resource type; it never covers project admin resource types
    const scopes = isWildcard
      ? smartScopes.filter((s) => !projectAdminResourceTypes.includes(s.resourceType))
      : getScopesForResourceType(smartScopes, entry.resourceType);
    for (const scope of scopes) {
      const narrowed = narrowEntry(entry, isWildcard ? scope.resourceType : entry.resourceType, scope, context);
      if (narrowed) {
        result.resource.push(narrowed);
      }
    }
  }
  return result;
}

const readOnlyScope = /^[rs]+$/;

/**
 * Narrows an AccessPolicy resource entry by a single SMART scope.
 * @param entry - The original AccessPolicy resource entry.
 * @param resourceType - The resource type of the narrowed entry.
 * @param scope - The SMART scope to apply.
 * @param context - The Patient context, required for `patient/` scopes.
 * @returns The narrowed entry, or undefined if the scope grants no access within the entry.
 */
function narrowEntry(
  entry: AccessPolicyResource,
  resourceType: string,
  scope: SmartScope,
  context?: string
): AccessPolicyResource | undefined {
  if (!scope.scope) {
    // A scope with no permissions grants no access
    return undefined;
  }
  const params = getEntryParams(entry);
  if (!params) {
    return undefined;
  }
  for (const [key, value] of scope.params ?? []) {
    params.append(key, value);
  }
  if (scope.permissionType === 'patient') {
    if (!context) {
      // Should be unreachable: applySmartScopes rejects `patient/` scopes without a context
      throw new OperationOutcomeError(badRequest(missingPatientContext));
    }
    params.append('_compartment', context);
  }

  const result = deepClone(entry);
  delete result.compartment;
  result.resourceType = resourceType;
  if (params.size > 0) {
    result.criteria = `${resourceType}?${params.toString()}`;
  } else {
    delete result.criteria;
  }

  if (readOnlyScope.exec(scope.scope)) {
    result.readonly = true;
    result.interaction = result.interaction?.filter((interaction) => readInteractions.includes(interaction));
    if (result.interaction?.length === 0) {
      return undefined;
    }
  }
  return result;
}

/**
 * Returns the search filters already enforced by an AccessPolicy resource entry.
 * @param entry - The AccessPolicy resource entry.
 * @returns The entry's filters, or undefined if the entry cannot be safely narrowed.
 */
function getEntryParams(entry: AccessPolicyResource): URLSearchParams | undefined {
  if (entry.criteria && !entry.criteria.startsWith(entry.resourceType + '?')) {
    // Rejected by the repository; must not be repaired into usable criteria
    return undefined;
  }
  // Same segment parseSearchRequest() reads; anything after a second '?' is ignored there too
  const params = new URLSearchParams(entry.criteria?.split('?')[1]);
  if (entry.compartment) {
    // The repository ignores criteria on an entry with the deprecated compartment, so it must become a filter
    const compartment = getLiteralReference(entry.compartment);
    if (!compartment) {
      return undefined;
    }
    params.append('_compartment', compartment);
  }
  return params;
}

function getScopesForResourceType(scopes: SmartScope[], resourceType: string): SmartScope[] {
  // Project admin resource types are only covered by scopes that name them
  const wildcardMatches = !projectAdminResourceTypes.includes(resourceType);
  return scopes.filter((s) => s.resourceType === resourceType || (wildcardMatches && s.resourceType === '*'));
}
