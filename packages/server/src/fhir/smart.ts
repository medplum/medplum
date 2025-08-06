// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/*
 * Parse HL7 SMART scope strings.
 * https://build.fhir.org/ig/HL7/smart-app-launch/scopes-and-launch-context.html
 */

import { ContentType, deepClone, OAuthGrantType, OAuthTokenAuthMethod, splitN } from '@medplum/core';
import { AccessPolicy, AccessPolicyResource } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import qs from 'node:querystring';
import { getConfig } from '../config/loader';
import { PopulatedAccessPolicy } from './accesspolicy';

const smartScopeFormat = /^(patient|user|system)\/(\w+|\*)\.(read|write|c?r?u?d?s?|\*)$/;

export interface SmartScope {
  readonly permissionType: 'patient' | 'user' | 'system';
  readonly resourceType: string;
  readonly scope: string;
  readonly criteria?: string;
}

/**
 * Handles requests for the SMART configuration.
 * See: https://build.fhir.org/ig/HL7/smart-app-launch/conformance.html
 * See: https://build.fhir.org/ig/HL7/smart-app-launch/scopes-and-launch-context.html
 * @param _req - The HTTP request.
 * @param res - The HTTP response.
 */
export function smartConfigurationHandler(_req: Request, res: Response): void {
  const config = getConfig();
  res
    .status(200)
    .contentType(ContentType.JSON)
    .json({
      issuer: config.issuer,
      jwks_uri: config.jwksUrl,
      authorization_endpoint: config.authorizeUrl,
      grant_types_supported: [
        OAuthGrantType.ClientCredentials,
        OAuthGrantType.AuthorizationCode,
        OAuthGrantType.RefreshToken,
        OAuthGrantType.TokenExchange,
      ],
      token_endpoint: config.tokenUrl,
      token_endpoint_auth_methods_supported: [
        OAuthTokenAuthMethod.ClientSecretBasic,
        OAuthTokenAuthMethod.ClientSecretPost,
        OAuthTokenAuthMethod.PrivateKeyJwt,
      ],
      token_endpoint_auth_signing_alg_values_supported: ['RS256', 'RS384', 'ES384'],
      scopes_supported: [
        'patient/*.rs',
        'user/*.cruds',
        'openid',
        'fhirUser',
        'launch',
        'launch/patient',
        'offline_access',
        'online_access',
      ],
      response_types_supported: ['code'],
      introspection_endpoint: config.introspectUrl,
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

  if (scope) {
    for (const scopeTerm of scope.split(' ')) {
      const parsed = parseSmartScopeString(scopeTerm);
      if (parsed) {
        result.push(parsed);
      }
    }
  }

  return result;
}

export function parseSmartScopeString(scope: string): SmartScope | undefined {
  const [baseScope, query] = splitN(scope, '?', 2);
  const match = smartScopeFormat.exec(baseScope);

  if (!match) {
    return undefined;
  }

  let criteria: string | undefined;
  if (query) {
    // Parse and normalize query parameters, without affecting string encoding, for safety
    const parsed = qs.parse(query, '&', '=', { decodeURIComponent: (s) => s });
    criteria = qs.stringify(parsed, '&', '=', { encodeURIComponent: (s) => s });
  }

  return {
    permissionType: match[1] as 'patient' | 'user' | 'system',
    resourceType: match[2],
    scope: normalizeV2ScopeString(match[3]),
    criteria,
  };
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
 * If there is no access policy, a new one is created.
 * Otherwise, the AccessPolicy is modified to only include the SMART scopes.
 * @param accessPolicy - The original access policy.
 * @param scope - The OAuth scope string.
 * @returns Updated access policy with the OAuth scope applied.
 */
export function applySmartScopes(
  accessPolicy: PopulatedAccessPolicy,
  scope: string | undefined
): PopulatedAccessPolicy {
  const smartScopes = parseSmartScopes(scope);
  if (smartScopes.length === 0) {
    // No SMART scopes, so no changes to the access policy
    return accessPolicy;
  }

  // Build an access policy that is the intersection of the existing access policy and the SMART scopes
  return intersectSmartScopes(accessPolicy, smartScopes);
}

function intersectSmartScopes(accessPolicy: AccessPolicy, smartScope: SmartScope[]): PopulatedAccessPolicy {
  // Build list of AccessPolicy entries
  if (!accessPolicy.resource) {
    // If none specified, generate an AccessPolicy from scratch
    return generateSmartScopesPolicy(smartScope);
  }

  const result: PopulatedAccessPolicy = { ...accessPolicy, resource: [] };
  for (const policy of accessPolicy.resource) {
    const scope = getScopeForResourceType(smartScope, policy.resourceType);
    if (scope) {
      const merged = mergeAccessPolicyWithScope(policy, scope);
      result.resource.push(merged);
    } else if (policy.resourceType === '*') {
      for (const scope of smartScope) {
        const merged = mergeAccessPolicyWithScope(policy, scope);
        merged.resourceType = scope.resourceType;
        result.resource.push(merged);
      }
    }
  }
  return result;
}

const readOnlyScope = /^[rs]+$/;
function mergeAccessPolicyWithScope(policy: AccessPolicyResource, scope: SmartScope): AccessPolicyResource {
  const result = deepClone(policy);
  if (result.criteria?.startsWith('*') && scope.resourceType !== '*') {
    result.criteria = result.criteria.replace('*', scope.resourceType);
  }

  if (scope.scope.match(readOnlyScope)) {
    result.readonly = true;
  }
  if (scope.criteria) {
    result.criteria = `${result.criteria ?? scope.resourceType + '?'}${result.criteria && !result.criteria?.endsWith('&') ? '&' : ''}${scope.criteria}`;
  }
  return result;
}

function getScopeForResourceType(scopes: SmartScope[], resourceType: string): SmartScope | undefined {
  return scopes.find((s) => s.resourceType === resourceType) ?? scopes.find((s) => s.resourceType === '*');
}

function generateSmartScopesPolicy(smartScopes: SmartScope[]): PopulatedAccessPolicy {
  const result: PopulatedAccessPolicy = {
    resourceType: 'AccessPolicy',
    resource: [],
  };

  for (const smartScope of smartScopes) {
    (result.resource as AccessPolicyResource[]).push({
      resourceType: smartScope.resourceType,
    });
  }

  return result;
}
