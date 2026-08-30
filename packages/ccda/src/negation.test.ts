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
 * @param options - Optional negation indicators for the act and the observation.
 * @param options.actNegationInd - Optional negationInd attribute for the Problem Concern Act.
 * @param options.observationNegationInd - Optional negationInd attribute for the Problem Observation.
 * @returns The C-CDA XML string.
 */
function createProblemDocument(options?: { actNegationInd?: string; observationNegationInd?: string }): string {
  const actNegation = options?.actNegationInd ? ` negationInd="${options.actNegationInd}"` : '';
  const observationNegation = options?.observationNegationInd
    ? ` negationInd="${options.observationNegationInd}"`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <typeId extension="POCD_HD000040" root="2.16.840.1.113883.1.3"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.2"/>
  <id root="8542cef2-4d2f-4a02-9d9f-2f2e94e5b485"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1"/>
  <title>Negation Test</title>
  <effectiveTime value="20240101"/>
  <recordTarget>
    <patientRole>
      <id root="c2b31c22-2b17-4a21-9d77-e58bd8a3a3f4"/>
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
            <act classCode="ACT" moodCode="EVN"${actNegation}>
              <templateId root="2.16.840.1.113883.10.20.22.4.3"/>
              <id root="7f3a1c9e-9c3c-4f6e-8f4a-1f2b3c4d5e6f"/>
              <code code="CONC" codeSystem="2.16.840.1.113883.5.6"/>
              <statusCode code="active"/>
              <effectiveTime>
                <low value="20240101"/>
              </effectiveTime>
              <entryRelationship typeCode="SUBJ">
                <observation classCode="OBS" moodCode="EVN"${observationNegation}>
                  <templateId root="2.16.840.1.113883.10.20.22.4.4"/>
                  <id root="1d8a5c3b-6e4f-4a2b-9c8d-7e6f5a4b3c2d"/>
                  <code code="55607006" codeSystem="2.16.840.1.113883.6.96"/>
                  <statusCode code="completed"/>
                  <effectiveTime>
                    <low value="20240101"/>
                  </effectiveTime>
                  <value xsi:type="CD" code="233604007" codeSystem="2.16.840.1.113883.6.96" displayName="Pneumonia"/>
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

describe('Problem Observation negationInd', () => {
  test('without negationInd, verification status is confirmed', () => {
    const condition = convertToCondition(createProblemDocument());
    expect(condition.verificationStatus?.coding?.[0]?.code).toBe('confirmed');
  });

  test('negationInd="true" on the observation produces refuted verification status', () => {
    const condition = convertToCondition(createProblemDocument({ observationNegationInd: 'true' }));
    expect(condition.verificationStatus?.coding?.[0]?.code).toBe('refuted');
    expect(condition.verificationStatus?.coding?.[0]?.system).toBe(
      'http://terminology.hl7.org/CodeSystem/condition-ver-status'
    );
  });

  test('negationInd="true" on the concern act produces refuted verification status', () => {
    const condition = convertToCondition(createProblemDocument({ actNegationInd: 'true' }));
    expect(condition.verificationStatus?.coding?.[0]?.code).toBe('refuted');
    expect(condition.verificationStatus?.coding?.[0]?.system).toBe(
      'http://terminology.hl7.org/CodeSystem/condition-ver-status'
    );
  });

  test('negationInd="false" is treated as not negated', () => {
    const condition = convertToCondition(createProblemDocument({ observationNegationInd: 'false' }));
    expect(condition.verificationStatus?.coding?.[0]?.code).toBe('confirmed');
  });
});
