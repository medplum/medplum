// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { OperationOutcome, Parameters, Questionnaire } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test, vi } from 'vitest';
import {
  assembleContactIntake,
  contactIntake,
  extractContactIntake,
  publishReviewedAssembly,
} from './assembled-questionnaires';

test('assembly helper exposes warnings for the publisher to review', async () => {
  const medplum = new MockClient();
  const questionnaire: Questionnaire = {
    resourceType: 'Questionnaire',
    status: 'draft',
    url: contactIntake.url,
    version: '1',
  };
  const outcome: OperationOutcome = {
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'warning', code: 'business-rule', details: { text: 'Review this input' } }],
  };
  const originalPost = medplum.post.bind(medplum);
  const envelope: Parameters = {
    resourceType: 'Parameters',
    parameter: [
      { name: 'return', resource: questionnaire },
      { name: 'outcome', resource: outcome },
    ],
  };
  const post = vi.spyOn(medplum, 'post').mockImplementation((url, body, options) => {
    if (url.toString().endsWith('/$assemble')) {
      return Promise.resolve(envelope);
    }
    return originalPost(url, body, options);
  });
  expect(await assembleContactIntake(medplum)).toEqual({ questionnaire, outcome });
  expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/\$assemble$/), {});
});

test('does not publish an unassembled source or extract an unfinished or mismatched assignment', async () => {
  const medplum = new MockClient();
  await expect(publishReviewedAssembly(medplum, contactIntake)).rejects.toThrow('Review a versioned assembly');
  const questionnaire: Questionnaire = { ...contactIntake, id: 'published' };
  await expect(
    extractContactIntake(medplum, questionnaire, {
      resourceType: 'QuestionnaireResponse',
      status: 'in-progress',
      questionnaire: 'Questionnaire/published',
    })
  ).rejects.toThrow('Complete the response');
  await expect(
    extractContactIntake(medplum, questionnaire, {
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      questionnaire: 'Questionnaire/different',
    })
  ).rejects.toThrow('assigned Questionnaire');
});
