// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Condition } from '@medplum/fhirtypes';
import { convertCcdaToFhir } from './ccda-to-fhir';
import { convertXmlToCcda } from './xml';

/**
 * Builds a minimal C-CDA document containing a single Problem Concern Act
 * (2.16.840.1.113883.10.20.22.4.3) wrapping a single Problem Observation
 * (2.16.840.1.113883.10.20.22.4.4).
 *
 * @param options - Optional variations of the concern act and observation.
 * @param options.actStatusCode - Optional statusCode for the Problem Concern Act; omitted entirely when not provided.
 * @param options.observationHigh - Optional effectiveTime/high value for the Problem Observation.
 * @param options.problemStatusCode - Optional SNOMED CT code for a nested Problem Status observation.
 * @returns The C-CDA XML string.
 */
function createProblemDocument(options?: {
  actStatusCode?: string;
  observationHigh?: string;
  problemStatusCode?: string;
}): string {
  const actStatus = options?.actStatusCode ? `<statusCode code="${options.actStatusCode}"/>` : '';
  const observationHigh = options?.observationHigh ? `<high value="${options.observationHigh}"/>` : '';
  const problemStatus = options?.problemStatusCode
    ? `<entryRelationship typeCode="REFR">
                    <observation classCode="OBS" moodCode="EVN">
                      <templateId root="2.16.840.1.113883.10.20.22.4.6"/>
                      <code code="33999-4" codeSystem="2.16.840.1.113883.6.1"/>
                      <statusCode code="completed"/>
                      <value xsi:type="CD" code="${options.problemStatusCode}" codeSystem="2.16.840.1.113883.6.96"/>
                    </observation>
                  </entryRelationship>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <typeId extension="POCD_HD000040" root="2.16.840.1.113883.1.3"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.2"/>
  <id root="0e1cb6cd-4c22-4b12-9c37-1cf1e4d1a6c8"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1"/>
  <title>Problem Status Test</title>
  <effectiveTime value="20240101"/>
  <recordTarget>
    <patientRole>
      <id root="8f0b6ce7-9d4e-4a95-96b2-6a4c1d3e2f10"/>
      <patient>
        <name>
          <given>Jane</given>
          <family>Doe</family>
        </name>
      </patient>
    </patientRole>
  </recordTarget>
  <component>
    <structuredBody>
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.5.1"/>
          <code code="11450-4" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Problems</title>
          <text>Problems</text>
          <entry>
            <act classCode="ACT" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.3"/>
              <id root="3e2d1c0b-9a8f-4e7d-b6c5-a4b3c2d1e0f9"/>
              <code code="CONC" codeSystem="2.16.840.1.113883.5.6"/>
              ${actStatus}
              <effectiveTime>
                <low value="20240101"/>
              </effectiveTime>
              <entryRelationship typeCode="SUBJ">
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.4"/>
                  <id root="5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d"/>
                  <code code="55607006" codeSystem="2.16.840.1.113883.6.96"/>
                  <statusCode code="completed"/>
                  <effectiveTime>
                    <low value="20240101"/>
                    ${observationHigh}
                  </effectiveTime>
                  <value xsi:type="CD" code="233604007" codeSystem="2.16.840.1.113883.6.96" displayName="Pneumonia"/>
                  ${problemStatus}
                </observation>
              </entryRelationship>
            </act>
          </entry>
        </section>
      </component>
    </structuredBody>
  </component>
</ClinicalDocument>`;
}

function convertToCondition(xml: string): Condition {
  const bundle = convertCcdaToFhir(convertXmlToCcda(xml));
  const condition = bundle.entry?.find((e) => e.resource?.resourceType === 'Condition')?.resource as Condition;
  expect(condition).toBeDefined();
  return condition;
}

describe('Condition clinical status', () => {
  describe('Problem Concern Act statusCode', () => {
    test('active concern produces active clinical status', () => {
      const condition = convertToCondition(createProblemDocument({ actStatusCode: 'active' }));
      expect(condition.clinicalStatus?.coding?.[0]?.code).toBe('active');
      expect(condition.clinicalStatus?.coding?.[0]?.system).toBe(
        'http://terminology.hl7.org/CodeSystem/condition-clinical'
      );
    });

    test('completed concern with an effectiveTime high produces resolved clinical status', () => {
      const condition = convertToCondition(
        createProblemDocument({ actStatusCode: 'completed', observationHigh: '20240601' })
      );
      expect(condition.clinicalStatus?.coding?.[0]?.code).toBe('resolved');
    });

    test('completed concern without an effectiveTime high produces inactive clinical status', () => {
      const condition = convertToCondition(createProblemDocument({ actStatusCode: 'completed' }));
      expect(condition.clinicalStatus?.coding?.[0]?.code).toBe('inactive');
    });

    test('suspended concern produces inactive clinical status', () => {
      const condition = convertToCondition(createProblemDocument({ actStatusCode: 'suspended' }));
      expect(condition.clinicalStatus?.coding?.[0]?.code).toBe('inactive');
    });

    test('concern without a statusCode defaults to active clinical status', () => {
      // The Problem Observation's own statusCode ("completed") describes the recording
      // act, not the problem, so it must not influence the clinical status.
      const condition = convertToCondition(createProblemDocument());
      expect(condition.clinicalStatus?.coding?.[0]?.code).toBe('active');
    });
  });

  describe('Problem Status observation', () => {
    test('SNOMED 55561003 (Active) takes precedence over a completed concern', () => {
      const condition = convertToCondition(
        createProblemDocument({ actStatusCode: 'completed', problemStatusCode: '55561003' })
      );
      expect(condition.clinicalStatus?.coding?.[0]?.code).toBe('active');
    });

    test('SNOMED 413322009 (Resolved) takes precedence over an active concern', () => {
      const condition = convertToCondition(
        createProblemDocument({ actStatusCode: 'active', problemStatusCode: '413322009' })
      );
      expect(condition.clinicalStatus?.coding?.[0]?.code).toBe('resolved');
    });

    test('unrecognized problem status code falls back to the concern act statusCode', () => {
      const condition = convertToCondition(
        createProblemDocument({ actStatusCode: 'active', problemStatusCode: '999999999' })
      );
      expect(condition.clinicalStatus?.coding?.[0]?.code).toBe('active');
    });
  });
});
