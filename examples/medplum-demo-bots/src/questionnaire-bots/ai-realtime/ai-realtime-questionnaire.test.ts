// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent } from '@medplum/core';
import type { Parameters, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test, vi } from 'vitest';
import { handler } from './ai-realtime-questionnaire';

const contentType = 'application/fhir+json';

const questionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  item: [
    {
      linkId: 'demographics',
      text: 'Demographics',
      type: 'group',
      item: [
        { linkId: 'first-name', text: 'First Name', type: 'string' },
        { linkId: 'last-name', text: 'Last Name', type: 'string' },
        { linkId: 'dob', text: 'Date of Birth', type: 'date' },
        { linkId: 'age', text: 'Age', type: 'integer' },
        { linkId: 'veteran', text: 'Veteran', type: 'boolean' },
        { linkId: 'state', text: 'State', type: 'choice', answerValueSet: 'http://example.com/states' },
        {
          linkId: 'pregnancy-status',
          text: 'Pregnancy Status',
          type: 'choice',
          answerOption: [
            { valueCoding: { system: 'http://snomed.info/sct', code: '77386006', display: 'Pregnant' } },
            { valueCoding: { system: 'http://snomed.info/sct', code: '60001007', display: 'Not pregnant' } },
          ],
        },
      ],
    },
    {
      linkId: 'emergency-contact',
      text: 'Emergency Contact',
      type: 'group',
      repeats: true,
      item: [{ linkId: 'ec-name', text: 'Name', type: 'string' }],
    },
    {
      linkId: 'pharmacy',
      text: 'Pharmacy',
      type: 'reference',
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
          valueCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/fhir-types', code: 'Organization' }] },
        },
      ],
    },
  ],
};

// Builds the BotEvent the handler expects.
function buildEvent(transcript: string, existing?: QuestionnaireResponse): BotEvent<Parameters> {
  const parameter: Parameters['parameter'] = [
    { name: 'questionnaire', valueString: JSON.stringify(questionnaire) },
    { name: 'transcript', valueString: transcript },
  ];
  if (existing) {
    parameter.push({ name: 'questionnaireResponse', valueString: JSON.stringify(existing) });
  }
  return {
    bot: { reference: 'Bot/123' },
    contentType,
    input: { resourceType: 'Parameters', parameter },
    secrets: {},
  };
}

// Stubs medplum.post to return the given flat delta as the $ai `content`.
function stubAi(medplum: MockClient, flat: object): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(medplum, 'post').mockResolvedValue({
    resourceType: 'Parameters',
    parameter: [{ name: 'content', valueString: JSON.stringify(flat) }],
  }) as ReturnType<typeof vi.spyOn>;
}

// Pulls the merged QuestionnaireResponse out of the handler's Parameters output.
function parseResult(result: Parameters): QuestionnaireResponse {
  const valueString = result.parameter?.find((p) => p.name === 'questionnaireResponse')?.valueString;
  return JSON.parse(valueString as string) as QuestionnaireResponse;
}

test('First call builds the response from the flat delta, nested in its group', async () => {
  const medplum = new MockClient();
  stubAi(medplum, { updates: { 'first-name': 'Jorge' } });

  const result = await handler(medplum, buildEvent('My first name is Jorge'));
  const qr = parseResult(result);

  expect(qr.resourceType).toBe('QuestionnaireResponse');
  expect(qr.status).toBe('in-progress');
  expect(qr.item).toEqual([
    { linkId: 'demographics', item: [{ linkId: 'first-name', answer: [{ valueString: 'Jorge' }] }] },
  ]);
});

test('Multiple fields in one turn share their group wrapper and are typed correctly', async () => {
  const medplum = new MockClient();
  stubAi(medplum, {
    updates: { 'first-name': 'John', age: 35, veteran: true, dob: '1990-04-15' },
  });

  const result = await handler(medplum, buildEvent("I'm John, 35, a veteran, born April 15 1990"));
  const qr = parseResult(result);

  expect(qr.item).toEqual([
    {
      linkId: 'demographics',
      item: [
        { linkId: 'first-name', answer: [{ valueString: 'John' }] },
        { linkId: 'age', answer: [{ valueInteger: 35 }] },
        { linkId: 'veteran', answer: [{ valueBoolean: true }] },
        { linkId: 'dob', answer: [{ valueDate: '1990-04-15' }] },
      ],
    },
  ]);
});

test('Single-field change merges into existing response and preserves group siblings', async () => {
  const medplum = new MockClient();
  const existing: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'in-progress',
    item: [
      {
        linkId: 'demographics',
        item: [
          { linkId: 'first-name', answer: [{ valueString: 'David' }] },
          { linkId: 'last-name', answer: [{ valueString: 'Yáñez' }] },
        ],
      },
    ],
  };
  stubAi(medplum, { updates: { 'first-name': 'Jorge' } });

  const result = await handler(medplum, buildEvent('Actually my first name is Jorge', existing));
  const qr = parseResult(result);

  expect(qr.item).toEqual([
    {
      linkId: 'demographics',
      item: [
        { linkId: 'first-name', answer: [{ valueString: 'Jorge' }] },
        { linkId: 'last-name', answer: [{ valueString: 'Yáñez' }] },
      ],
    },
  ]);
});

test('Repeating group array fully replaces prior instances', async () => {
  const medplum = new MockClient();
  const existing: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'in-progress',
    item: [
      { linkId: 'demographics', item: [{ linkId: 'first-name', answer: [{ valueString: 'David' }] }] },
      { linkId: 'emergency-contact', item: [{ linkId: 'ec-name', answer: [{ valueString: 'Stephen' }] }] },
    ],
  };
  stubAi(medplum, {
    updates: { 'emergency-contact': [{ 'ec-name': 'Stephen' }, { 'ec-name': 'Alma' }] },
  });

  const result = await handler(medplum, buildEvent('Add Alma as an emergency contact', existing));
  const qr = parseResult(result);

  expect(qr.item).toEqual([
    { linkId: 'demographics', item: [{ linkId: 'first-name', answer: [{ valueString: 'David' }] }] },
    { linkId: 'emergency-contact', item: [{ linkId: 'ec-name', answer: [{ valueString: 'Stephen' }] }] },
    { linkId: 'emergency-contact', item: [{ linkId: 'ec-name', answer: [{ valueString: 'Alma' }] }] },
  ]);
});

test('Empty array for a repeating group removes all instances', async () => {
  const medplum = new MockClient();
  const existing: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'in-progress',
    item: [
      { linkId: 'demographics', item: [{ linkId: 'first-name', answer: [{ valueString: 'David' }] }] },
      { linkId: 'emergency-contact', item: [{ linkId: 'ec-name', answer: [{ valueString: 'Stephen' }] }] },
    ],
  };
  stubAi(medplum, { updates: { 'emergency-contact': [] } });

  const result = await handler(medplum, buildEvent('Remove my emergency contacts', existing));
  const qr = parseResult(result);

  expect(qr.item).toEqual([
    { linkId: 'demographics', item: [{ linkId: 'first-name', answer: [{ valueString: 'David' }] }] },
  ]);
});

test('Clear blanks a field without removing the item structure around it', async () => {
  const medplum = new MockClient();
  const existing: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'in-progress',
    item: [
      {
        linkId: 'demographics',
        item: [
          { linkId: 'first-name', answer: [{ valueString: 'David' }] },
          { linkId: 'last-name', answer: [{ valueString: 'Yáñez' }] },
        ],
      },
    ],
  };
  stubAi(medplum, { updates: {}, clear: ['last-name'] });

  const result = await handler(medplum, buildEvent('Remove my last name', existing));
  const qr = parseResult(result);

  expect(qr.item).toEqual([
    {
      linkId: 'demographics',
      item: [{ linkId: 'first-name', answer: [{ valueString: 'David' }] }, { linkId: 'last-name' }],
    },
  ]);
});

test('Choice with inline options resolves to the option coding (label match, case-insensitive)', async () => {
  const medplum = new MockClient();
  stubAi(medplum, { updates: { 'pregnancy-status': 'pregnant' } });

  const result = await handler(medplum, buildEvent("I'm pregnant"));
  const qr = parseResult(result);

  expect(qr.item).toEqual([
    {
      linkId: 'demographics',
      item: [
        {
          linkId: 'pregnancy-status',
          answer: [{ valueCoding: { system: 'http://snomed.info/sct', code: '77386006', display: 'Pregnant' } }],
        },
      ],
    },
  ]);
});

test('ValueSet-backed choice resolves via $expand with the value as filter', async () => {
  const medplum = new MockClient();
  stubAi(medplum, { updates: { state: 'California' } });
  const expandSpy = vi.spyOn(medplum, 'valueSetExpand').mockResolvedValue({
    resourceType: 'ValueSet',
    status: 'active',
    expansion: {
      timestamp: '2026-01-01T00:00:00Z',
      contains: [{ system: 'https://www.usps.com/', code: 'CA', display: 'California' }],
    },
  });

  const result = await handler(medplum, buildEvent('I live in California'));
  const qr = parseResult(result);

  expect(expandSpy).toHaveBeenCalledWith({ url: 'http://example.com/states', filter: 'California', count: 1 });
  expect(qr.item).toEqual([
    {
      linkId: 'demographics',
      item: [
        {
          linkId: 'state',
          answer: [{ valueCoding: { system: 'https://www.usps.com/', code: 'CA', display: 'California' } }],
        },
      ],
    },
  ]);
});

test('ValueSet-backed choice falls back to valueString when $expand finds nothing', async () => {
  const medplum = new MockClient();
  stubAi(medplum, { updates: { state: 'Atlantis' } });
  vi.spyOn(medplum, 'valueSetExpand').mockRejectedValue(new Error('not found'));

  const result = await handler(medplum, buildEvent('I live in Atlantis'));
  const qr = parseResult(result);

  expect(qr.item).toEqual([
    { linkId: 'demographics', item: [{ linkId: 'state', answer: [{ valueString: 'Atlantis' }] }] },
  ]);
});

test('Reference field resolves by name search on the target resource type', async () => {
  const medplum = new MockClient();
  stubAi(medplum, { updates: { pharmacy: 'CVS Main Street' } });
  const searchSpy = vi.spyOn(medplum, 'searchOne').mockResolvedValue({
    resourceType: 'Organization',
    id: 'org-1',
    name: 'CVS Main Street',
  });

  const result = await handler(medplum, buildEvent('My pharmacy is CVS on Main Street'));
  const qr = parseResult(result);

  expect(searchSpy).toHaveBeenCalledWith('Organization', { name: 'CVS Main Street' });
  expect(qr.item).toEqual([
    {
      linkId: 'pharmacy',
      answer: [{ valueReference: { reference: 'Organization/org-1', display: 'CVS Main Street' } }],
    },
  ]);
});

test('Unresolved reference and unknown linkIds are dropped, invalid numbers rejected', async () => {
  const medplum = new MockClient();
  stubAi(medplum, {
    updates: { pharmacy: 'Nowhere Pharmacy', 'not-a-field': 'x', age: 'not a number' },
  });
  vi.spyOn(medplum, 'searchOne').mockResolvedValue(undefined);

  const result = await handler(medplum, buildEvent('gibberish'));
  const qr = parseResult(result);

  expect(qr.item).toEqual([]);
});

test('Empty updates leave the existing response unchanged', async () => {
  const medplum = new MockClient();
  const existing: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'in-progress',
    item: [{ linkId: 'demographics', item: [{ linkId: 'first-name', answer: [{ valueString: 'David' }] }] }],
  };
  stubAi(medplum, { updates: {} });

  const result = await handler(medplum, buildEvent('um, never mind', existing));
  const qr = parseResult(result);
  expect(qr.item).toEqual([
    { linkId: 'demographics', item: [{ linkId: 'first-name', answer: [{ valueString: 'David' }] }] },
  ]);
});

test('Strips markdown code fences from the model output', async () => {
  const medplum = new MockClient();
  vi.spyOn(medplum, 'post').mockResolvedValue({
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'content',
        valueString: '```json\n{"updates":{"first-name":"Jorge"}}\n```',
      },
    ],
  });

  const result = await handler(medplum, buildEvent('My first name is Jorge'));
  const qr = parseResult(result);
  expect(qr.item).toEqual([
    { linkId: 'demographics', item: [{ linkId: 'first-name', answer: [{ valueString: 'Jorge' }] }] },
  ]);
});

test('Non-flat model output falls back to the legacy FHIR-authoring prompt', async () => {
  const medplum = new MockClient();
  // The model ignored the flat contract and returned FHIR items — both the first (flat) call
  // and the retry return this payload; only the legacy path can use it.
  const legacyPayload = {
    item: [{ linkId: 'demographics', item: [{ linkId: 'first-name', answer: [{ valueString: 'Jorge' }] }] }],
  };
  const postSpy = vi.spyOn(medplum, 'post').mockResolvedValue({
    resourceType: 'Parameters',
    parameter: [{ name: 'content', valueString: JSON.stringify(legacyPayload) }],
  });

  const result = await handler(medplum, buildEvent('My first name is Jorge'));
  const qr = parseResult(result);

  expect(postSpy).toHaveBeenCalledTimes(2);
  const secondCall = postSpy.mock.calls[1][1] as Parameters;
  const messages = JSON.parse(secondCall.parameter?.find((p) => p.name === 'messages')?.valueString as string);
  expect(messages[0].content).toContain('FHIR Questionnaire');
  expect(qr.item).toEqual([
    { linkId: 'demographics', item: [{ linkId: 'first-name', answer: [{ valueString: 'Jorge' }] }] },
  ]);
});

test('Prompt contains the flat schema and only answered form state, minified, temperature 0', async () => {
  const medplum = new MockClient();
  const existing: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'in-progress',
    item: [
      {
        linkId: 'demographics',
        item: [
          { linkId: 'first-name', text: 'First Name', answer: [{ valueString: 'David' }], id: 'id-1' },
          { linkId: 'last-name', text: 'Last Name', id: 'id-2' },
        ],
      },
      { linkId: 'emergency-contact', item: [{ linkId: 'ec-name', answer: [{ valueString: 'Stephen' }] }] },
    ],
  };
  const postSpy = stubAi(medplum, { updates: {} });

  await handler(medplum, buildEvent('hello', existing));

  const aiParams = postSpy.mock.calls[0][1] as Parameters;
  const messages = JSON.parse(aiParams.parameter?.find((p) => p.name === 'messages')?.valueString as string);
  const userMessage: string = messages[1].content;

  // Schema: repeating group flagged, choice options inlined.
  const schemaBlock = userMessage.slice(userMessage.indexOf('FORM_SCHEMA:'), userMessage.indexOf('FORM_STATE:'));
  expect(schemaBlock).toContain('"group[]"');
  expect(schemaBlock).toContain('"Pregnant"');

  // Form state: only answered fields, repeating group as array of objects, no text/id noise.
  const stateBlock = userMessage.slice(userMessage.indexOf('FORM_STATE:'), userMessage.indexOf("User's spoken input:"));
  expect(stateBlock).toContain('"first-name":"David"');
  expect(stateBlock).toContain('"emergency-contact":[{"ec-name":"Stephen"}]');
  expect(stateBlock).not.toContain('"last-name"');
  expect(stateBlock).not.toContain('id-1');
  // Minified — no pretty-print indentation anywhere in the prompt.
  expect(userMessage).not.toContain('\n  ');

  expect(aiParams.parameter?.find((p) => p.name === 'temperature')?.valueDecimal).toBe(0);
});
