// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AllergyIntolerance } from '@medplum/fhirtypes';
import { convertCcdaToFhir } from './ccda-to-fhir';
import { convertXmlToCcda } from './xml';

const SNOMED_CT = '2.16.840.1.113883.6.96';
const RXNORM = '2.16.840.1.113883.6.88';

function allergyFromObservationValue(valueCode: string, valueCodeSystem: string): AllergyIntolerance {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <recordTarget>
    <patientRole>
      <patient>
        <name use="L"><given>Test</given><family>Patient</family></name>
      </patient>
    </patientRole>
  </recordTarget>
  <component>
    <structuredBody>
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.6.1" extension="2015-08-01"/>
          <code code="48765-2" codeSystem="2.16.840.1.113883.6.1"/>
          <entry>
            <act classCode="ACT" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.30" extension="2015-08-01"/>
              <id root="00000000-0000-4000-8000-0000000000a1"/>
              <code code="CONC" codeSystem="2.16.840.1.113883.5.6"/>
              <statusCode code="active"/>
              <entryRelationship typeCode="SUBJ">
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.7" extension="2014-06-09"/>
                  <id root="00000000-0000-4000-8000-0000000000a2"/>
                  <code code="ASSERTION" codeSystem="2.16.840.1.113883.5.4"/>
                  <statusCode code="completed"/>
                  <value xsi:type="CD" code="${valueCode}" codeSystem="${valueCodeSystem}"/>
                  <participant typeCode="CSM">
                    <participantRole classCode="MANU">
                      <playingEntity classCode="MMAT">
                        <code code="4053" codeSystem="${RXNORM}" displayName="Erythromycin"/>
                      </playingEntity>
                    </participantRole>
                  </participant>
                </observation>
              </entryRelationship>
            </act>
          </entry>
        </section>
      </component>
    </structuredBody>
  </component>
</ClinicalDocument>`;
  const bundle = convertCcdaToFhir(convertXmlToCcda(xml));
  const allergy = bundle.entry?.find((e) => e.resource?.resourceType === 'AllergyIntolerance')
    ?.resource as AllergyIntolerance;
  expect(allergy).toBeDefined();
  return allergy;
}

describe('C-CDA to FHIR AllergyIntolerance category and type', () => {
  test.each([
    ['416098002', ['medication'], 'allergy'],
    ['59037007', ['medication'], 'intolerance'],
    ['419511003', ['medication'], undefined],
    ['414285001', ['food'], 'allergy'],
    ['235719002', ['food'], 'intolerance'],
    ['418471000', ['food'], undefined],
    ['426232007', ['environment'], 'allergy'],
    ['444316004', ['environment'], 'allergy'],
    ['12481000132103', ['biologic'], 'allergy'],
    ['419199007', undefined, 'allergy'],
    ['609328004', undefined, 'allergy'],
    ['418038007', undefined, undefined],
    ['420134006', undefined, undefined],
  ])('SNOMED CT %s maps to category %j and type %s', (code: string, category?: string[], type?: string) => {
    const allergy = allergyFromObservationValue(code, SNOMED_CT);

    expect(allergy.category).toEqual(category);
    expect(allergy.type).toEqual(type);
  });

  test('leaves category and type unset for a code outside the value set', () => {
    const allergy = allergyFromObservationValue('22298006', SNOMED_CT);

    expect(allergy.category).toBeUndefined();
    expect(allergy.type).toBeUndefined();
  });

  test('leaves category and type unset for a value from another code system', () => {
    const allergy = allergyFromObservationValue('59037007', RXNORM);

    expect(allergy.category).toBeUndefined();
    expect(allergy.type).toBeUndefined();
  });
});
