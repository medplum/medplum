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
      ],
    },
    {
      linkId: 'emergency-contact',
      text: 'Emergency Contact',
      type: 'group',
      repeats: true,
      item: [{ linkId: 'ec-name', text: 'Name', type: 'string' }],
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

// Stubs medplum.post to return the given partial response items as the $ai `content`.
function stubAi(medplum: MockClient, partial: object): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(medplum, 'post').mockResolvedValue({
    resourceType: 'Parameters',
    parameter: [{ name: 'content', valueString: JSON.stringify(partial) }],
  }) as ReturnType<typeof vi.spyOn>;
}

// Pulls the merged QuestionnaireResponse out of the handler's Parameters output.
function parseResult(result: Parameters): QuestionnaireResponse {
  const valueString = result.parameter?.find((p) => p.name === 'questionnaireResponse')?.valueString;
  return JSON.parse(valueString as string) as QuestionnaireResponse;
}

test('First call returns the model output as the full response', async () => {
  const medplum = new MockClient();
  stubAi(medplum, { item: [{ linkId: 'first-name', answer: [{ valueString: 'Jorge' }] }] });

  const result = await handler(medplum, buildEvent('My first name is Jorge'));
  const qr = parseResult(result);

  expect(qr.resourceType).toBe('QuestionnaireResponse');
  expect(qr.status).toBe('in-progress');
  expect(qr.item).toEqual([{ linkId: 'first-name', answer: [{ valueString: 'Jorge' }] }]);
});

test('Single-field change merges into existing response and leaves other items untouched', async () => {
  const medplum = new MockClient();
  const existing: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'in-progress',
    item: [
      { linkId: 'first-name', text: 'First Name', answer: [{ valueString: 'David' }] },
      { linkId: 'last-name', text: 'Last Name', answer: [{ valueString: 'Yáñez' }] },
    ],
  };
  stubAi(medplum, { item: [{ linkId: 'first-name', answer: [{ valueString: 'Jorge' }] }] });

  const result = await handler(medplum, buildEvent('Actually my first name is Jorge', existing));
  const qr = parseResult(result);

  // first-name answer replaced (existing text preserved), last-name untouched.
  expect(qr.item).toEqual([
    { linkId: 'first-name', text: 'First Name', answer: [{ valueString: 'Jorge' }] },
    { linkId: 'last-name', text: 'Last Name', answer: [{ valueString: 'Yáñez' }] },
  ]);
});

test('Changing one field in a non-repeating group preserves sibling answers', async () => {
  const medplum = new MockClient();
  // first-name already captured inside the demographics group.
  const existing: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'in-progress',
    item: [{ linkId: 'demographics', item: [{ linkId: 'first-name', answer: [{ valueString: 'David' }] }] }],
  };
  // Model returns only the changed nested field (last-name), not the whole group.
  stubAi(medplum, {
    item: [{ linkId: 'demographics', item: [{ linkId: 'last-name', answer: [{ valueString: 'Giannis' }] }] }],
  });

  const result = await handler(medplum, buildEvent('My last name is Giannis', existing));
  const qr = parseResult(result);

  // first-name must survive alongside the new last-name.
  expect(qr.item).toEqual([
    {
      linkId: 'demographics',
      item: [
        { linkId: 'first-name', answer: [{ valueString: 'David' }] },
        { linkId: 'last-name', answer: [{ valueString: 'Giannis' }] },
      ],
    },
  ]);
});

test('Updating an existing answer inside a group keeps siblings and overwrites that answer', async () => {
  const medplum = new MockClient();
  const existing: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'in-progress',
    item: [
      {
        linkId: 'demographics',
        item: [
          { linkId: 'first-name', answer: [{ valueString: 'David' }] },
          { linkId: 'last-name', answer: [{ valueString: 'Giannis' }] },
        ],
      },
    ],
  };
  stubAi(medplum, {
    item: [{ linkId: 'demographics', item: [{ linkId: 'first-name', answer: [{ valueString: 'Jorge' }] }] }],
  });

  const result = await handler(medplum, buildEvent('Actually my first name is Jorge', existing));
  const qr = parseResult(result);

  expect(qr.item).toEqual([
    {
      linkId: 'demographics',
      item: [
        { linkId: 'first-name', answer: [{ valueString: 'Jorge' }] },
        { linkId: 'last-name', answer: [{ valueString: 'Giannis' }] },
      ],
    },
  ]);
});

test('Repeating group from the model fully replaces prior instances', async () => {
  const medplum = new MockClient();
  const existing: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'in-progress',
    item: [
      { linkId: 'first-name', answer: [{ valueString: 'David' }] },
      { linkId: 'emergency-contact', item: [{ linkId: 'ec-name', answer: [{ valueString: 'Stephen' }] }] },
    ],
  };
  // Model returns both instances it wants present for the repeating group.
  stubAi(medplum, {
    item: [
      { linkId: 'emergency-contact', item: [{ linkId: 'ec-name', answer: [{ valueString: 'Stephen' }] }] },
      { linkId: 'emergency-contact', item: [{ linkId: 'ec-name', answer: [{ valueString: 'Alma' }] }] },
    ],
  });

  const result = await handler(medplum, buildEvent('Add Alma as an emergency contact', existing));
  const qr = parseResult(result);

  // first-name preserved at its position; the single existing contact replaced by the two returned.
  expect(qr.item).toEqual([
    { linkId: 'first-name', answer: [{ valueString: 'David' }] },
    { linkId: 'emergency-contact', item: [{ linkId: 'ec-name', answer: [{ valueString: 'Stephen' }] }] },
    { linkId: 'emergency-contact', item: [{ linkId: 'ec-name', answer: [{ valueString: 'Alma' }] }] },
  ]);
});

test('New top-level group from the model is appended', async () => {
  const medplum = new MockClient();
  const existing: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'in-progress',
    item: [{ linkId: 'first-name', answer: [{ valueString: 'David' }] }],
  };
  stubAi(medplum, {
    item: [{ linkId: 'emergency-contact', item: [{ linkId: 'ec-name', answer: [{ valueString: 'Alma' }] }] }],
  });

  const result = await handler(medplum, buildEvent('My emergency contact is Alma', existing));
  const qr = parseResult(result);

  expect(qr.item).toEqual([
    { linkId: 'first-name', answer: [{ valueString: 'David' }] },
    { linkId: 'emergency-contact', item: [{ linkId: 'ec-name', answer: [{ valueString: 'Alma' }] }] },
  ]);
});

test('Empty diff leaves the existing response unchanged', async () => {
  const medplum = new MockClient();
  const existing: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'in-progress',
    item: [{ linkId: 'first-name', answer: [{ valueString: 'David' }] }],
  };
  stubAi(medplum, { item: [] });

  const result = await handler(medplum, buildEvent('um, never mind', existing));
  const qr = parseResult(result);
  expect(qr.item).toEqual([{ linkId: 'first-name', answer: [{ valueString: 'David' }] }]);
});

test('Strips markdown code fences from the model output', async () => {
  const medplum = new MockClient();
  vi.spyOn(medplum, 'post').mockResolvedValue({
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'content',
        valueString: '```json\n{"item":[{"linkId":"first-name","answer":[{"valueString":"Jorge"}]}]}\n```',
      },
    ],
  });

  const result = await handler(medplum, buildEvent('My first name is Jorge'));
  const qr = parseResult(result);
  expect(qr.item).toEqual([{ linkId: 'first-name', answer: [{ valueString: 'Jorge' }] }]);
});

test('Prompt is trimmed: empty items dropped, JSON minified', async () => {
  const medplum = new MockClient();
  const existing: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'in-progress',
    item: [
      { linkId: 'first-name', text: 'First Name', answer: [{ valueString: 'David' }], id: 'id-1' },
      // Unanswered items that should be excluded from the prompt.
      { linkId: 'last-name', text: 'Last Name', id: 'id-2' },
      { linkId: 'emergency-contact', text: 'Emergency Contact', item: [{ linkId: 'ec-name', id: 'id-3' }] },
    ],
  };
  const postSpy = stubAi(medplum, { item: [] });

  await handler(medplum, buildEvent('hello', existing));

  const aiParams = postSpy.mock.calls[0][1] as Parameters;
  const messages = JSON.parse(aiParams.parameter?.find((p) => p.name === 'messages')?.valueString as string);
  const userMessage: string = messages[1].content;

  // The "captured so far" context contains only answered items, no text/id.
  const capturedBlock = userMessage.slice(
    userMessage.indexOf('Answers captured so far:'),
    userMessage.indexOf("User's spoken input:")
  );
  expect(capturedBlock).toContain('"first-name"');
  expect(capturedBlock).toContain('"David"');
  expect(capturedBlock).not.toContain('"last-name"');
  expect(capturedBlock).not.toContain('id-1');
  expect(capturedBlock).not.toContain('"text"');
  // Minified — no pretty-print indentation anywhere in the prompt.
  expect(userMessage).not.toContain('\n  ');

  // temperature is forwarded to the $ai operation.
  expect(aiParams.parameter?.find((p) => p.name === 'temperature')?.valueDecimal).toBe(0.3);
});
