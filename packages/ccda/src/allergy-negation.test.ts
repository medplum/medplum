// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AllergyIntolerance } from '@medplum/fhirtypes';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { convertCcdaToFhir } from './ccda-to-fhir';
import { convertXmlToCcda } from './xml';

const SNOMED_CT = '2.16.840.1.113883.6.96';
const RXNORM = '2.16.840.1.113883.6.88';
const NULL_FLAVOR_SUBSTANCE = '<code nullFlavor="NA"/>';
const ERYTHROMYCIN = `<code code="4053" codeSystem="${RXNORM}" displayName="Erythromycin"/>`;

function allergies(xml: string): AllergyIntolerance[] {
  const bundle = convertCcdaToFhir(convertXmlToCcda(xml));
  return (bundle.entry ?? [])
    .map((e) => e.resource)
    .filter((r): r is AllergyIntolerance => r?.resourceType === 'AllergyIntolerance');
}

function convertAllergy(
  valueCode: string,
  substance: string,
  negationInd?: string,
  valueCodeSystem = SNOMED_CT
): AllergyIntolerance {
  const negation = negationInd ? ` negationInd="${negationInd}"` : '';
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
              <id root="00000000-0000-4000-8000-0000000000b1"/>
              <code code="CONC" codeSystem="2.16.840.1.113883.5.6"/>
              <statusCode code="active"/>
              <entryRelationship typeCode="SUBJ">
                <observation classCode="OBS" moodCode="EVN"${negation}>
                  <templateId root="2.16.840.1.113883.10.20.22.4.7" extension="2014-06-09"/>
                  <id root="00000000-0000-4000-8000-0000000000b2"/>
                  <code code="ASSERTION" codeSystem="2.16.840.1.113883.5.4"/>
                  <statusCode code="completed"/>
                  <value xsi:type="CD" code="${valueCode}" codeSystem="${valueCodeSystem}"/>
                  <participant typeCode="CSM">
                    <participantRole classCode="MANU">
                      <playingEntity classCode="MMAT">
                        ${substance}
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
  const result = allergies(xml);
  expect(result).toHaveLength(1);
  return result[0];
}

describe('C-CDA to FHIR negated AllergyIntolerance', () => {
  // https://hl7.org/fhir/us/ccda/ConceptMap-CF-NoKnownAllergies.html
  test.each([
    ['419199007', '716186003'],
    ['416098002', '409137002'],
    ['414285001', '429625007'],
  ])('negated value %s with no substance maps to "no known" code %s', (valueCode, noKnownCode) => {
    const allergy = convertAllergy(valueCode, NULL_FLAVOR_SUBSTANCE, 'true');

    expect(allergy.code?.coding).toEqual([
      expect.objectContaining({ system: 'http://snomed.info/sct', code: noKnownCode }),
    ]);
    expect(allergy.verificationStatus?.coding?.[0]?.code).toBe('confirmed');
  });

  // A substance code with no code in it (only a nullFlavor, text or a code system) names no substance,
  // and neither does the generic SNOMED CT 105590001 "Substance".
  test.each([
    [
      'a nullFlavor with an originalText reference',
      '<code nullFlavor="NA"><originalText><reference value="#a1"/></originalText></code>',
    ],
    ['a nullFlavor with originalText', '<code nullFlavor="UNK"><originalText>No Known Allergies</originalText></code>'],
    ['a nullFlavor with a codeSystem', `<code nullFlavor="NA" codeSystem="${RXNORM}"/>`],
    ['SNOMED CT "Substance"', `<code code="105590001" codeSystem="${SNOMED_CT}" displayName="Substance"/>`],
    [
      'a nullFlavor with a SNOMED CT "Substance" translation',
      `<code nullFlavor="OTH" codeSystem="${RXNORM}"><translation code="105590001" codeSystem="${SNOMED_CT}" displayName="Substance"/></code>`,
    ],
    ['absent', ''],
  ])('negated observation whose substance code is %s maps to "no known allergy"', (_, substance) => {
    const allergy = convertAllergy('419199007', substance, 'true');

    expect(allergy.code?.coding?.[0]?.code).toBe('716186003');
    expect(allergy.extension).toBeUndefined();
  });

  // nullFlavor OTH means the code is in another code system: the translation names the substance.
  test('negated substance coded only in a translation is a named substance, not "no known allergy"', () => {
    const allergy = convertAllergy(
      '416098002',
      `<code nullFlavor="OTH" codeSystem="2.16.840.1.113883.6.69"><originalText>Penicillin</originalText><translation code="70618" codeSystem="${RXNORM}" displayName="Penicillin"/></code>`,
      'true'
    );
    const substance = allergy.extension
      ?.find((e) => e.url === 'http://hl7.org/fhir/StructureDefinition/allergyintolerance-substanceExposureRisk')
      ?.extension?.find((e) => e.url === 'substance')?.valueCodeableConcept;

    expect(allergy.code).toBeUndefined();
    expect(substance?.coding).toContainEqual({
      system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
      code: '70618',
      display: 'Penicillin',
    });
  });

  test.each([
    ['420134006', SNOMED_CT],
    ['416098002', RXNORM],
  ])('negated value %s (%s) with no "no known" concept is refuted rather than confirmed', (valueCode, system) => {
    const allergy = convertAllergy(valueCode, NULL_FLAVOR_SUBSTANCE, 'true', system);

    expect(allergy.code).toBeUndefined();
    expect(allergy.verificationStatus?.coding?.[0]?.code).toBe('refuted');
  });

  test('negated named substance is recorded as no known reaction risk, not as an allergy to it', () => {
    const allergy = convertAllergy('416098002', ERYTHROMYCIN, 'true');

    expect(allergy.code).toBeUndefined();
    expect(allergy.extension).toContainEqual({
      url: 'http://hl7.org/fhir/StructureDefinition/allergyintolerance-substanceExposureRisk',
      extension: [
        {
          url: 'substance',
          valueCodeableConcept: {
            coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '4053', display: 'Erythromycin' }],
            text: 'Erythromycin',
          },
        },
        {
          url: 'exposureRisk',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/allerg-intol-substance-exp-risk',
                code: 'no-known-reaction-risk',
                display: 'No Known Reaction Risk',
              },
            ],
          },
        },
      ],
    });
  });

  test('negated named substance keeps its narrative reference', () => {
    const allergy = convertAllergy(
      '416098002',
      `<code code="4053" codeSystem="${RXNORM}" displayName="Erythromycin"><originalText><reference value="#allergen1"/></originalText></code>`,
      'true'
    );
    const substance = allergy.extension
      ?.find((e) => e.url === 'http://hl7.org/fhir/StructureDefinition/allergyintolerance-substanceExposureRisk')
      ?.extension?.find((e) => e.url === 'substance')?.valueCodeableConcept;

    expect(substance?.extension).toEqual([
      { url: 'https://medplum.com/fhir/StructureDefinition/ccda-narrative-reference', valueString: '#allergen1' },
    ]);
  });

  test.each([undefined, 'false'])('observation with negationInd %s keeps the substance as the code', (negationInd) => {
    const allergy = convertAllergy('416098002', ERYTHROMYCIN, negationInd);

    expect(allergy.code?.coding?.[0]?.code).toBe('4053');
    expect(allergy.verificationStatus?.coding?.[0]?.code).toBe('confirmed');
    expect(allergy.extension).toBeUndefined();
  });

  test('ONC (b)(1) sample with "no known allergies" yields a "no known allergy" code, not an allergy', () => {
    const xml = readFileSync(
      join(resolve(__dirname, '../testdata'), '170.315_b1_toc_amb_ccd_r21_sample2_v11.xml'),
      'utf8'
    );
    const result = allergies(xml);

    expect(result).toHaveLength(1);
    expect(result[0].code?.coding?.[0]?.code).toBe('716186003');
    expect(result[0].clinicalStatus?.coding?.[0]?.code).toBe('active');
    expect(result[0].verificationStatus?.coding?.[0]?.code).toBe('confirmed');
    expect(result[0].extension).toBeUndefined();
  });
});
