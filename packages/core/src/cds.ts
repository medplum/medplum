// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  Coding,
  Patient,
  Practitioner,
  PractitionerRole,
  RelatedPerson,
  Resource,
  ResourceType,
} from '@medplum/fhirtypes';
import type { MedplumClient } from './client';
import { generateId } from './crypto';
import type { WithId } from './utils';
import { isString, splitN } from './utils';

/**
 * CDS Service definition.
 * See {@link https://cds-hooks.hl7.org/#response | CDS Hooks Discovery} for full details.
 */
export interface CdsService {
  readonly id: string;
  readonly hook: string;
  readonly title?: string;
  readonly description?: string;
  readonly usageRequirements?: string;
  readonly prefetch?: Record<string, string>;
}

/**
 * CDS Request definition.
 * See {@link https://cds-hooks.hl7.org/#http-request-1 | Calling a CDS Service} for full details.
 */
export interface CdsRequest {
  readonly hook: string;
  readonly hookInstance: string;
  readonly context: Record<string, unknown>;
  readonly prefetch?: Record<string, unknown>;
}

/**
 * CDS FHIR Authorization definition.
 */
export interface CdsFhirAuthorization {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in?: number;
  readonly scope?: string;
  readonly subject?: string;
}

/**
 * CDS Request with FHIR authorization.
 */
export interface CdsRequestWithAuth extends CdsRequest {
  readonly fhirServer: string;
  readonly fhirAuthorization: CdsFhirAuthorization;
}

/**
 * CDS Response definition.
 * See {@link https://cds-hooks.hl7.org/#cds-service-response | CDS Service Response} for full details.
 */
export interface CdsResponse {
  readonly cards: CdsCard[];
  readonly systemActions?: CdsAction[];
}

/**
 * CDS Card definition.
 * See {@link https://cds-hooks.hl7.org/#card-attributes | CDS Cards} for full details.
 */
export interface CdsCard {
  readonly uuid?: string;
  readonly summary: string;
  readonly detail?: string;
  readonly indicator: 'info' | 'warning' | 'hard-stop';
  readonly source?: CdsSource;
  readonly suggestions?: CdsSuggestion[];
  readonly links?: CdsLink[];
}

/**
 * CDS Source definition.
 * See {@link https://cds-hooks.hl7.org/#source | CDS Source} for full details.
 */
export interface CdsSource {
  readonly label: string;
  readonly url?: string;
  readonly icon?: string;
  readonly topic?: Coding;
}

/**
 * CDS Suggestion definition.
 * See {@link https://cds-hooks.hl7.org/#suggestion | CDS Suggestions} for full details.
 */
export interface CdsSuggestion {
  readonly label: string;
  readonly uuid?: string;
  readonly isRecommended?: boolean;
  readonly actions: CdsAction[];
}

/**
 * CDS Create Action.
 * See {@link https://cds-hooks.hl7.org/#actions | CDS Actions} for full details.
 */
export interface CdsCreateAction {
  readonly type: 'create';
  readonly description: string;
  readonly resource: Resource;
}

/**
 * CDS Update Action.
 * See {@link https://cds-hooks.hl7.org/#actions | CDS Actions} for full details.
 */
export interface CdsUpdateAction {
  readonly type: 'update';
  readonly description: string;
  readonly resource: Resource;
}

/**
 * CDS Delete Action.
 * See {@link https://cds-hooks.hl7.org/#actions | CDS Actions} for full details.
 */
export interface CdsDeleteAction {
  readonly type: 'delete';
  readonly description: string;
  readonly resourceId: string;
}

/**
 * CDS Action.
 * See {@link https://cds-hooks.hl7.org/#actions | CDS Actions} for full details.
 */
export type CdsAction = CdsCreateAction | CdsUpdateAction | CdsDeleteAction;

/**
 * CDS Link definition.
 * See {@link https://cds-hooks.hl7.org/#link | CDS Link} for full details.
 */
export interface CdsLink {
  readonly label: string;
  readonly url: string;
  readonly type: 'absolute' | 'smart' | 'relative';
  readonly appContext?: string;
  readonly autolaunchable?: boolean;
}

export type CdsUserResource = WithId<Patient | Practitioner | PractitionerRole | RelatedPerson>;

/**
 * Builds a CDS request.
 * @param medplum - The Medplum client.
 * @param user - The user resource.
 * @param service - The CDS service definition.
 * @param context - The CDS request context.
 * @returns The fully populated CDS request.
 */
export async function buildCdsRequest(
  medplum: MedplumClient,
  user: CdsUserResource,
  service: CdsService,
  context: Record<string, unknown>
): Promise<CdsRequest> {
  return {
    hook: service.hook,
    hookInstance: generateId(),
    context,
    prefetch: await buildPrefetch(medplum, user, service, context),
  };
}

async function buildPrefetch(
  medplum: MedplumClient,
  user: CdsUserResource,
  service: CdsService,
  context: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!service.prefetch) {
    return {};
  }
  const prefetch: Record<string, unknown> = {};
  for (const [key, query] of Object.entries(service.prefetch)) {
    const result = await evaluatePrefetch(medplum, user, context, query);
    prefetch[key] = result ?? null;
  }
  return prefetch;
}

function evaluatePrefetch(
  medplum: MedplumClient,
  user: CdsUserResource,
  context: Record<string, unknown>,
  query: string
): Promise<Resource | null | undefined> {
  query = replaceQueryVariables(user, context, query);
  if (query.includes('{{')) {
    return Promise.resolve(null);
  }

  const referenceMatch = query.match(/^(\w+)\/([0-9a-zA-Z-_]+)$/);
  if (referenceMatch) {
    // Read request
    const [resourceType, id] = referenceMatch.slice(1);
    return medplum.readResource(resourceType as ResourceType, id);
  }

  // Search request
  const [resourceType, queryString] = splitN(query, '?', 2);
  return medplum.search(resourceType as ResourceType, queryString);
}

/**
 * See {@link https://cds-hooks.hl7.org/#prefetch-tokens-identifying-the-user | CDS Hooks Prefetch Tokens} for full details.
 */
const userProfileTokens = ['userPractitionerId', 'userPractitionerRoleId', 'userPatientId', 'userRelatedPersonId'];

function replaceQueryVariables(user: CdsUserResource, context: Record<string, unknown>, query: string): string {
  return query.replace(/\{\{(.*?)\}\}/g, (substring, varName) => {
    varName = varName.trim();

    if (userProfileTokens.includes(varName)) {
      return user.id;
    }

    if (varName.startsWith('context.')) {
      const contextVarName = varName.substring('context.'.length);
      const value = context[contextVarName];
      if (isString(value)) {
        return value;
      }
    }

    // No match; return the original substring
    return substring;
  });
}
