// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference, getReferenceString } from '@medplum/core';
import type { Parameters, ParametersParameter } from '@medplum/fhirtypes';
import { prepareApp, prepareProject } from '../../test.utils';

describe('$explain', () => {
  const app = prepareApp();
  const superProject = prepareProject({ superAdmin: true, withAccessToken: true });

  const linkedProject = prepareProject({ withClient: true });
  const project = prepareProject(() => ({
    withClient: true,
    project: { link: [{ project: createReference(linkedProject.project) }] },
  }));

  test.each(['json', 'text'])('Success with %s format', async (format) => {
    const res1 = await app.request
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + superProject.accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'query', valueString: 'Patient?active=true' },
          { name: 'analyze', valueBoolean: true },
          { name: 'format', valueString: format },
        ],
      } satisfies Parameters);
    expect(res1.status).toBe(200);

    const output = res1.body.parameter as ParametersParameter[];
    expect(output).toHaveLength(3);
    expect(output).toStrictEqual(
      expect.arrayContaining<ParametersParameter>([
        { name: 'query', valueString: expect.stringContaining('SELECT "Patient"') },
        { name: 'parameters', valueString: expect.stringContaining('$1 = ') },
        { name: 'explain', valueString: expect.stringContaining(format === 'json' ? '{"Plan":' : '(cost=') },
      ])
    );
  });

  test('Respects On-Behalf-Of', async () => {
    const res1 = await app.request
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + superProject.accessToken)
      .set('X-Medplum-On-Behalf-Of', getReferenceString(project.membership))
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'query', valueString: 'Patient?active=true' }],
      } satisfies Parameters);
    expect(res1.status).toBe(200);

    const output = res1.body.parameter as ParametersParameter[];
    const plan = output.find((p) => p.name === 'explain')?.valueString;
    expect(plan).toContain(project.project.id);
    expect(plan).toContain(linkedProject.project.id);
  });
});
