// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// start-block imports
import type { MedplumClient } from '@medplum/core';
import { deepClone } from '@medplum/core';
import type { Questionnaire, QuestionnaireItem } from '@medplum/fhirtypes';
// end-block imports

// start-block modules
export const visitBasics = {
  resourceType: 'Questionnaire',
  url: 'https://example.org/Questionnaire/visit-basics',
  version: '1.0.0',
  status: 'active',
  subjectType: ['Patient'],
  item: [
    {
      linkId: 'basics',
      text: 'About your visit',
      type: 'group',
      item: [{ linkId: 'basics-goal', text: 'What would you like to discuss?', type: 'text' }],
    },
  ],
} satisfies Questionnaire;

export const clinicPreparation = {
  resourceType: 'Questionnaire',
  url: 'https://example.org/Questionnaire/clinic-preparation',
  version: '1.0.0',
  status: 'active',
  subjectType: ['Patient'],
  item: [
    {
      linkId: 'clinic',
      text: 'Preparing for your visit',
      type: 'group',
      item: [
        { linkId: 'clinic-needs-help', text: 'Would you like help preparing for your visit?', type: 'boolean' },
        {
          linkId: 'clinic-help-details',
          text: 'What help would be useful?',
          type: 'text',
          enableWhen: [{ question: 'clinic-needs-help', operator: '=', answerBoolean: true }],
        },
      ],
    },
  ],
} satisfies Questionnaire;
// end-block modules

// start-block compose
export function buildVisitPreparation(): Questionnaire {
  // These two reviewed modules contain self-contained item trees.
  const item = deepClone([...visitBasics.item, ...clinicPreparation.item]);
  assertUniqueLinkIds(item);
  return {
    resourceType: 'Questionnaire',
    status: 'draft',
    title: 'Prepare for your visit',
    version: '1.0.0',
    subjectType: ['Patient'],
    item,
  };
}
// end-block compose

// start-block checkIds
export function assertUniqueLinkIds(items: QuestionnaireItem[], seen = new Set<string>()): void {
  for (const item of items) {
    if (seen.has(item.linkId)) {
      throw new Error(`Duplicate Questionnaire linkId: ${item.linkId}`);
    }
    seen.add(item.linkId);
    assertUniqueLinkIds(item.item ?? [], seen);
  }
}
// end-block checkIds

// start-block publish
export async function publishVisitPreparation(medplum: MedplumClient): Promise<Questionnaire> {
  const questionnaire = buildVisitPreparation();
  const identifier = {
    system: 'https://example.org/questionnaire-definition',
    value: `visit-preparation-${questionnaire.version}`,
  };
  return medplum.createResourceIfNoneExist<Questionnaire>(
    { ...questionnaire, status: 'active', identifier: [identifier] },
    new URLSearchParams({ identifier: `${identifier.system}|${identifier.value}` }).toString()
  );
}
// end-block publish
