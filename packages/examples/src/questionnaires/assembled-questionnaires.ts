// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { deepClone, getReferenceString, OperationOutcomeError } from '@medplum/core';
import type {
  Bundle,
  Element,
  Extension,
  HumanName,
  OperationOutcome,
  Parameters,
  Patient,
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireResponse,
  Reference,
} from '@medplum/fhirtypes';

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
const capability = 'http://hl7.org/fhir/StructureDefinition/cqf-knowledgeCapability';
const definitionIdentifier = 'https://example.org/questionnaire-definition';
const computable: Extension = { url: capability, valueCode: 'computable' };
const child: Extension = { url: sdc + 'assemble-expectation', valueCode: 'independent-child' };

// start-block modules
export const visitModule: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  url: 'https://example.org/Questionnaire/visit-summary',
  version: '1',
  extension: [computable, child],
  item: [{ linkId: 'reason', type: 'text', text: 'What would you like to discuss?' }],
};

export const contactModule: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  url: 'https://example.org/Questionnaire/contact-name',
  version: '1',
  extension: [computable, child],
  // FHIR primitive extensions use underscore properties omitted from the generated types.
  contained: [
    {
      resourceType: 'RelatedPerson',
      id: 'contact-template',
      patient: {
        _reference: { extension: [{ url: sdc + 'templateExtractValue', valueString: '%resource.subject.reference' }] },
      } as Reference<Patient> & { _reference: Element },
      name: [
        {
          _text: { extension: [{ url: sdc + 'templateExtractValue', valueString: 'item.answer.value.first()' }] },
        } as HumanName & { _text: Element },
      ],
    },
  ],
  item: [
    {
      linkId: 'details',
      type: 'group',
      extension: [
        {
          url: sdc + 'templateExtract',
          extension: [{ url: 'template', valueReference: { reference: '#contact-template' } }],
        },
      ],
      item: [{ linkId: 'name', type: 'string', text: 'Contact name', required: true }],
    },
  ],
};
// end-block modules

// start-block include
function includeModule(questionnaire: Questionnaire, prefix: string, text: string): QuestionnaireItem {
  return {
    linkId: prefix,
    type: 'group',
    text,
    extension: [
      {
        url: 'http://hl7.org/fhir/StructureDefinition/variable',
        valueExpression: { name: 'linkIdPrefix', language: 'text/fhirpath', expression: `'${prefix}.'` },
      },
    ],
    item: [
      {
        linkId: `${prefix}-placeholder`,
        type: 'display',
        text: 'Module unavailable',
        extension: [{ url: sdc + 'subQuestionnaire', valueCanonical: `${questionnaire.url}|${questionnaire.version}` }],
      },
    ],
  };
}

// end-block include

// start-block root
export const contactIntake: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  title: 'Visit and contacts',
  url: 'https://example.org/Questionnaire/contact-intake',
  version: '1',
  subjectType: ['Patient'],
  extension: [computable, { url: sdc + 'assemble-expectation', valueCode: 'assemble-root' }],
  item: [
    includeModule(visitModule, 'visit', 'About your visit'),
    includeModule(contactModule, 'primary', 'Primary contact'),
    { linkId: 'add-secondary', type: 'boolean', text: 'Add another contact?' },
    {
      ...includeModule(contactModule, 'secondary', 'Secondary contact'),
      enableWhen: [{ question: 'add-secondary', operator: '=', answerBoolean: true }],
    },
  ],
};
// end-block root

async function storeDefinition(
  medplum: MedplumClient,
  definition: Questionnaire,
  representation: string
): Promise<Questionnaire> {
  const identifier = {
    system: definitionIdentifier,
    value: `${representation}:${definition.url}|${definition.version}`,
  };
  return medplum.createResourceIfNoneExist<Questionnaire>(
    { ...deepClone(definition), identifier: [identifier] },
    new URLSearchParams({ identifier: `${identifier.system}|${identifier.value}` }).toString()
  );
}

// start-block assemble
export async function assembleContactIntake(
  medplum: MedplumClient
): Promise<{ questionnaire: Questionnaire; outcome?: OperationOutcome }> {
  // Save dependencies first. Reusing a published URL/version means reusing its immutable definition.
  await storeDefinition(medplum, visitModule, 'source');
  await storeDefinition(medplum, contactModule, 'source');
  const source = await storeDefinition(medplum, contactIntake, 'source');
  const result = await medplum.post<Questionnaire | Parameters>(`fhir/R4/Questionnaire/${source.id}/$assemble`, {});
  if (result.resourceType === 'Questionnaire') {
    return { questionnaire: result };
  }
  const questionnaire = result.parameter?.find((p) => p.name === 'return')?.resource;
  const outcome = result.parameter?.find((p) => p.name === 'outcome')?.resource;
  if (questionnaire?.resourceType !== 'Questionnaire') {
    throw new Error('Assembly did not return a Questionnaire');
  }
  return { questionnaire, outcome: outcome?.resourceType === 'OperationOutcome' ? outcome : undefined };
}
// end-block assemble

// start-block publish
export async function publishReviewedAssembly(
  medplum: MedplumClient,
  questionnaire: Questionnaire
): Promise<Questionnaire> {
  if (
    !questionnaire.url ||
    !questionnaire.version ||
    !questionnaire.extension?.some((e) => e.url === capability && e.valueCode === 'executable')
  ) {
    throw new Error('Review a versioned assembly before publishing');
  }
  // One reviewed build per root URL/version. The separate identifier keeps source and assembly distinct.
  return storeDefinition(medplum, { ...questionnaire, status: 'active' }, 'executable');
}
// end-block publish

// start-block reopen
export async function reopenContactIntake(
  medplum: MedplumClient,
  responseId: string
): Promise<{ questionnaire: Questionnaire; response: QuestionnaireResponse }> {
  const response = await medplum.readResource('QuestionnaireResponse', responseId);
  if (!/^Questionnaire\/[A-Za-z0-9.-]+$/.test(response.questionnaire ?? '')) {
    throw new Error('This example expects the stored assignment to reference a Questionnaire by ID');
  }
  const questionnaire = await medplum.readReference<Questionnaire>({ reference: response.questionnaire });
  return { questionnaire, response };
}
// end-block reopen

// start-block extract
export async function extractContactIntake(
  medplum: MedplumClient,
  questionnaire: Questionnaire,
  response: QuestionnaireResponse
): Promise<Bundle> {
  if (response.status !== 'completed' || response.questionnaire !== getReferenceString(questionnaire)) {
    throw new Error('Complete the response using its assigned Questionnaire before extraction');
  }
  const result = await medplum.post<Bundle | OperationOutcome>('fhir/R4/QuestionnaireResponse/$extract', {
    resourceType: 'Parameters',
    parameter: [
      { name: 'questionnaire-response', resource: response },
      { name: 'questionnaire', resource: questionnaire },
    ],
  } satisfies Parameters);
  if (result.resourceType === 'OperationOutcome') {
    throw new OperationOutcomeError(result);
  }
  return result; // Review the Bundle, then persist through the application's normal workflow.
}
// end-block extract
