/*
 * Parse HL7 SMART scope strings.
 * https://build.fhir.org/ig/HL7/smart-app-launch/scopes-and-launch-context.html
 */

import { ContentType, deepClone, OAuthGrantType, OAuthTokenAuthMethod } from '@medplum/core';
import { AccessPolicy, AccessPolicyResource } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getConfig } from '../config';

export interface SmartScope {
  readonly permissionType: 'patient' | 'user' | 'system';
  readonly resourceType: string;
  readonly scope: string;
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
      const match = /(patient|user|system)\/(\w+|\*)\.(\w+)/.exec(scopeTerm);
      if (match) {
        result.push({
          permissionType: match[1] as 'patient' | 'user' | 'system',
          resourceType: match[2],
          scope: match[3],
        });
      }
    }
  }

  return result;
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
export function applySmartScopes(accessPolicy: AccessPolicy, scope: string | undefined): AccessPolicy {
  const smartScopes = parseSmartScopes(scope);
  if (smartScopes.length === 0) {
    // No SMART scopes, so no changes to the access policy
    return accessPolicy;
  }

  // Build an access policy that is the intersection of the existing access policy and the SMART scopes
  return intersectSmartScopes(accessPolicy, smartScopes);
}

function intersectSmartScopes(accessPolicy: AccessPolicy, smartScope: SmartScope[]): AccessPolicy {
  const result = deepClone(accessPolicy);

  // Build list of AccessPolicy entries
  const accessPolicyEntries = result.resource;
  if (!accessPolicyEntries) {
    // If none specified, generate an AccessPolicy from scratch
    return generateSmartScopesPolicy(smartScope);
  }

  // Sort both by resource type
  accessPolicyEntries.sort((a, b) => (a.resourceType as string).localeCompare(b.resourceType as string));
  smartScope.sort((a, b) => a.resourceType.localeCompare(b.resourceType));

  let i = 0; // accessPolicyEntries index
  let j = 0; // smartScope index
  while (i < accessPolicyEntries.length && j < smartScope.length) {
    const accessPolicyResourceType = accessPolicyEntries[i].resourceType as string;
    const smartScopeResourceType = smartScope[j].resourceType;

    if (accessPolicyResourceType === smartScopeResourceType) {
      // Merge
      i++;
      j++;
    } else if (accessPolicyResourceType < smartScopeResourceType) {
      // Remove
      accessPolicyEntries.splice(i, 1);
    } else {
      // Ignore
      j++;
    }
  }

  // Ignore SMART scopes that don't match the resource type
  // Remove AccessPolicy entries that don't match the SMART scope
  if (i < accessPolicyEntries.length) {
    accessPolicyEntries.splice(i);
  }

  return result;
}

function generateSmartScopesPolicy(smartScopes: SmartScope[]): AccessPolicy {
  const result: AccessPolicy = {
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
