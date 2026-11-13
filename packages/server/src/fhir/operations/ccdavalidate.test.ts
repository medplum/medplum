// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';

const VALID = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  <id root="2.16.840.1.113883.19.5" extension="doc-1"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1" displayName="Summary of episode note"/>
  <effectiveTime value="20240101120000-0500"/>
  <confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25"/>
  <recordTarget>
    <patientRole>
      <id root="2.16.840.1.113883.19.5" extension="patient-1"/>
      <addr use="HP WP"><city>Anywhere</city></addr>
      <patient><name><given>Alice</given><family>Smith</family></name></patient>
    </patientRole>
  </recordTarget>
  <author>
    <time value="20240101"/>
    <assignedAuthor><id root="2.16.840.1.113883.19.5" extension="author-1"/></assignedAuthor>
  </author>
  <custodian>
    <assignedCustodian>
      <representedCustodianOrganization><id root="2.16.840.1.113883.19.5"/></representedCustodianOrganization>
    </assignedCustodian>
  </custodian>
  <component>
    <structuredBody>
      <component>
        <section>
          <code code="8716-3" codeSystem="2.16.840.1.113883.6.1"/>
          <text><paragraph>Vital signs</paragraph></text>
          <entry>
            <observation classCode="OBS" moodCode="EVN">
              <code code="8867-4" codeSystem="2.16.840.1.113883.6.1"/>
              <effectiveTime value="20240101"/>
              <value xsi:type="PQ" value="72" unit="/min"/>
            </observation>
          </entry>
        </section>
      </component>
    </structuredBody>
  </component>
</ClinicalDocument>`;

describe('$ccda-validate', () => {
  const app = express();
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  function validate(document?: string): request.Test {
    return request(app)
      .post('/fhir/R4/$ccda-validate')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: document === undefined ? [] : [{ name: 'document', valueString: document }],
      });
  }

  test('Valid document', async () => {
    const res = await validate(VALID);
    expect(res).toHaveStatus(200);
    expect(res.body).toMatchObject({ resourceType: 'OperationOutcome', issue: [{ severity: 'information' }] });
  });

  test('Invalid document', async () => {
    const res = await validate(VALID.replace('<effectiveTime value="20240101120000-0500"/>', ''));
    expect(res).toHaveStatus(200);
    expect((res.body as OperationOutcome).issue).toEqual([
      expect.objectContaining({
        severity: 'error',
        details: { text: 'Missing required property' },
        expression: ['ClinicalDocument.effectiveTime'],
      }),
    ]);
  });

  test('Missing document', async () => {
    const res = await validate();
    expect(res).toHaveStatus(400);
  });
});
