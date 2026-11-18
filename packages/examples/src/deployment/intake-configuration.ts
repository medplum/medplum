// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block imports
import type { MedplumClient } from '@medplum/core';
import { deepEquals, ensureTrailingSlash } from '@medplum/core';
import type { CodeSystem, Meta, Questionnaire, ValueSet } from '@medplum/fhirtypes';

export type Definition = CodeSystem | ValueSet | Questionnaire;
// end-block imports

// start-block definitions
const identifierSystem = 'https://example.com/configuration';

export const contactMethods: CodeSystem = {
  resourceType: 'CodeSystem',
  identifier: [{ system: identifierSystem, value: 'contact-methods-v1' }],
  url: 'https://example.com/fhir/CodeSystem/contact-methods-v1',
  version: '1.0.0',
  status: 'active',
  content: 'complete',
  caseSensitive: true,
  concept: [
    { code: 'email', display: 'Email' },
    { code: 'phone', display: 'Phone' },
  ],
};

export const contactChoices: ValueSet = {
  resourceType: 'ValueSet',
  identifier: [{ system: identifierSystem, value: 'intake-contact-choices-v1' }],
  url: 'https://example.com/fhir/ValueSet/intake-contact-choices-v1',
  version: '1.0.0',
  status: 'active',
  compose: { include: [{ system: contactMethods.url }] },
};

export const intake: Questionnaire = {
  resourceType: 'Questionnaire',
  identifier: [{ system: identifierSystem, value: 'intake-v1' }],
  url: 'https://example.com/fhir/Questionnaire/intake-v1',
  version: '1.0.0',
  status: 'active',
  title: 'Contact preferences',
  item: [
    {
      linkId: 'contact-method',
      text: 'How would you prefer to be contacted?',
      type: 'choice',
      required: true,
      answerValueSet: contactChoices.url,
    },
  ],
};

// Dependencies come before the resources that use them.
export const intakeConfiguration = [contactMethods, contactChoices, intake];
// end-block definitions

// start-block target
export interface DeploymentTarget {
  baseUrl: string;
  projectId: string;
}

export function checkTarget(medplum: MedplumClient, target: DeploymentTarget): void {
  if (
    new URL(medplum.getBaseUrl()).href !== new URL(ensureTrailingSlash(target.baseUrl)).href ||
    medplum.getProject()?.id !== target.projectId ||
    medplum.isSuperAdmin()
  ) {
    throw new Error('Deployment requires credentials for the expected server and project.');
  }
}
// end-block target

// start-block helpers
function definitionIdentifier(definition: Definition): { system: string; value: string } {
  const identifier = definition.identifier?.[0];
  if (!identifier?.system || !identifier.value || definition.id) {
    throw new Error('Definitions need a system/value identifier and must omit server-assigned IDs.');
  }
  return { system: identifier.system, value: identifier.value };
}

function identityQuery(definition: Definition, projectId: string): string {
  const identifier = definitionIdentifier(definition);
  return new URLSearchParams({
    identifier: `${identifier.system}|${identifier.value}`,
    _compartment: `Project/${projectId}`,
  }).toString();
}

function definitionContent(definition: Definition): Definition {
  const result = structuredClone(definition);
  delete result.id;
  // Preserve authored metadata, including profiles, tags, and security labels.
  const serverFields: (keyof Meta)[] = [
    'versionId',
    'lastUpdated',
    'project',
    'author',
    'compartment',
    'account',
    'accounts',
  ];
  for (const field of serverFields) {
    if (result.meta) {
      delete result.meta[field];
    }
  }
  if (result.meta && Object.keys(result.meta).length === 0) {
    delete result.meta;
  }
  return result;
}

function checkDefinition(actual: Definition, expected: Definition): void {
  if (!deepEquals(definitionContent(actual), definitionContent(expected))) {
    throw new Error(`Published definition differs: ${expected.resourceType}/${definitionIdentifier(expected).value}`);
  }
}

export async function previewConfiguration(
  medplum: MedplumClient,
  target: DeploymentTarget,
  definitions: Definition[]
): Promise<{ resourceType: string; identifier: string; action: 'create' | 'unchanged' }[]> {
  checkTarget(medplum, target);
  const plan: { resourceType: string; identifier: string; action: 'create' | 'unchanged' }[] = [];
  for (const definition of definitions) {
    const query = identityQuery(definition, target.projectId);
    const matches = await medplum.searchResources(definition.resourceType, `${query}&_count=2`, { cache: 'no-cache' });
    if (matches.length > 1) {
      throw new Error(`Multiple matches for ${definitionIdentifier(definition).value}`);
    }
    if (matches[0]) {
      checkDefinition(matches[0], definition);
    }
    if (definition.url) {
      const canonicalMatches = await medplum.searchResources(
        definition.resourceType,
        { url: definition.url, _count: 2 },
        { cache: 'no-cache' }
      );
      if (canonicalMatches.some((resource) => resource.id !== matches[0]?.id)) {
        throw new Error(`Canonical URL already used by another resource: ${definition.url}`);
      }
    }
    plan.push({
      resourceType: definition.resourceType,
      identifier: definitionIdentifier(definition).value,
      action: matches.length ? 'unchanged' : 'create',
    });
  }
  return plan;
}
// end-block helpers

// start-block deploy
export async function deployConfiguration(
  medplum: MedplumClient,
  target: DeploymentTarget,
  definitions: Definition[]
): Promise<Record<string, string>> {
  // Detect known conflicts before writing anything.
  await previewConfiguration(medplum, target, definitions);
  const references: Record<string, string> = {};
  for (const definition of definitions) {
    const saved = await medplum.createResourceIfNoneExist(definition, identityQuery(definition, target.projectId));
    // Recheck the server result in case another writer changed it after preview.
    checkDefinition(saved, definition);
    references[definitionIdentifier(definition).value] = `${saved.resourceType}/${saved.id}`;
  }
  return references;
}
// end-block deploy
