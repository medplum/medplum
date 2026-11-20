// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, UCUM } from '@medplum/core';
import type { Bundle, Composition, FamilyMemberHistory, Observation, Patient, Resource } from '@medplum/fhirtypes';
import type { CcdaToFhirOptions } from './ccda-to-fhir';
import { convertCcdaToFhir } from './ccda-to-fhir';
import { convertXmlToCcda } from './xml';

const FAMILY_HISTORY_SECTION = '2.16.840.1.113883.10.20.22.2.15';
const RESULTS_SECTION = '2.16.840.1.113883.10.20.22.2.3.1';

function convertSection(sectionTemplateId: string, entriesXml: string, options?: CcdaToFhirOptions): Bundle {
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
          <templateId root="${sectionTemplateId}" extension="2015-08-01"/>
          ${entriesXml}
        </section>
      </component>
    </structuredBody>
  </component>
</ClinicalDocument>`;
  return convertCcdaToFhir(convertXmlToCcda(xml), options);
}

function familyHistoryOrganizer(relationshipCodeXml: string, observationsXml: string): string {
  return `<entry typeCode="DRIV">
    <organizer moodCode="EVN" classCode="CLUSTER">
      <templateId root="2.16.840.1.113883.10.20.22.4.45" extension="2015-08-01"/>
      <id root="2.16.840.1.113883.19.5" extension="FH-1"/>
      <statusCode code="completed"/>
      <subject>
        <relatedSubject classCode="PRS">
          ${relationshipCodeXml}
          <subject>
            <administrativeGenderCode code="M" codeSystem="2.16.840.1.113883.5.1"/>
          </subject>
        </relatedSubject>
      </subject>
      ${observationsXml}
    </organizer>
  </entry>`;
}

function familyHistoryObservation(valueXml: string, entryRelationshipsXml = '', negationInd = false): string {
  return `<component>
    <observation classCode="OBS" moodCode="EVN"${negationInd ? ' negationInd="true"' : ''}>
      <templateId root="2.16.840.1.113883.10.20.22.4.46" extension="2015-08-01"/>
      <code code="64572001" codeSystem="2.16.840.1.113883.6.96" displayName="Disease"/>
      <statusCode code="completed"/>
      ${valueXml}
      ${entryRelationshipsXml}
    </observation>
  </component>`;
}

const father = '<code code="FTH" codeSystem="2.16.840.1.113883.5.111" displayName="father"/>';
const hypertension =
  '<value xsi:type="CD" code="38341003" codeSystem="2.16.840.1.113883.6.96" displayName="Hypertension"/>';
const myocardialInfarction =
  '<value xsi:type="CD" code="22298006" codeSystem="2.16.840.1.113883.6.96" displayName="Myocardial infarction"/>';

function ageAtOnset(years: number, negationInd = false): string {
  return `<entryRelationship typeCode="SUBJ" inversionInd="true">
    <observation classCode="OBS" moodCode="EVN"${negationInd ? ' negationInd="true"' : ''}>
      <templateId root="2.16.840.1.113883.10.20.22.4.31"/>
      <code code="445518008" codeSystem="2.16.840.1.113883.6.96" displayName="Age at onset of clinical finding"/>
      <statusCode code="completed"/>
      <value xsi:type="PQ" value="${years}" unit="a"/>
    </observation>
  </entryRelationship>`;
}

function causeOfDeath(negationInd = false): string {
  return `<entryRelationship typeCode="CAUS">
    <observation classCode="OBS" moodCode="EVN"${negationInd ? ' negationInd="true"' : ''}>
      <templateId root="2.16.840.1.113883.10.20.22.4.47"/>
      <code code="ASSERTION" codeSystem="2.16.840.1.113883.5.4"/>
      <statusCode code="completed"/>
      <value xsi:type="CD" code="419099009" codeSystem="2.16.840.1.113883.6.96" displayName="Dead"/>
    </observation>
  </entryRelationship>`;
}

function resourcesOfType<T extends Resource>(bundle: Bundle, resourceType: T['resourceType']): T[] {
  return (bundle.entry ?? []).map((e) => e.resource).filter((r): r is T => r?.resourceType === resourceType);
}

describe('family history', () => {
  test('converts a Family History Organizer to a FamilyMemberHistory of the patient', () => {
    const bundle = convertSection(
      FAMILY_HISTORY_SECTION,
      familyHistoryOrganizer(father, familyHistoryObservation(hypertension, ageAtOnset(60)))
    );

    const [patient] = resourcesOfType<Patient>(bundle, 'Patient');
    const histories = resourcesOfType<FamilyMemberHistory>(bundle, 'FamilyMemberHistory');
    expect(histories).toEqual([
      {
        resourceType: 'FamilyMemberHistory',
        id: expect.any(String),
        identifier: [{ system: 'urn:oid:2.16.840.1.113883.19.5', value: 'FH-1' }],
        status: 'completed',
        patient: createReference(patient),
        relationship: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'FTH', display: 'father' }],
          text: 'father',
        },
        sex: { coding: [{ system: 'http://hl7.org/fhir/administrative-gender', code: 'male' }] },
        condition: [
          {
            code: {
              coding: [{ system: 'http://snomed.info/sct', code: '38341003', display: 'Hypertension' }],
              text: 'Hypertension',
            },
            onsetAge: { value: 60, unit: 'a', system: UCUM, code: 'a' },
          },
        ],
      },
    ]);
    expect(resourcesOfType<Observation>(bundle, 'Observation')).toEqual([]);

    const [composition] = resourcesOfType<Composition>(bundle, 'Composition');
    expect(composition.section?.[0]?.entry).toEqual([createReference(histories[0])]);
  });

  test('makes one condition per observation, and marks the one that caused the death', () => {
    const bundle = convertSection(
      FAMILY_HISTORY_SECTION,
      familyHistoryOrganizer(
        father,
        familyHistoryObservation(hypertension) + familyHistoryObservation(myocardialInfarction, causeOfDeath())
      )
    );

    const [history] = resourcesOfType<FamilyMemberHistory>(bundle, 'FamilyMemberHistory');
    expect(history.condition?.map((c) => [c.code.coding?.[0]?.code, c.contributedToDeath])).toEqual([
      ['38341003', undefined],
      ['22298006', true],
    ]);
  });

  test('takes no condition, age at onset or death that the document negates', () => {
    const bundle = convertSection(
      FAMILY_HISTORY_SECTION,
      familyHistoryOrganizer(
        father,
        familyHistoryObservation(hypertension, ageAtOnset(60, true) + causeOfDeath(true)) +
          familyHistoryObservation(myocardialInfarction, '', true)
      )
    );

    const [history] = resourcesOfType<FamilyMemberHistory>(bundle, 'FamilyMemberHistory');
    expect(history.condition).toEqual([
      {
        code: {
          coding: [{ system: 'http://snomed.info/sct', code: '38341003', display: 'Hypertension' }],
          text: 'Hypertension',
        },
      },
    ]);
  });

  test('marks a relationship with a nullFlavor as unknown', () => {
    const bundle = convertSection(
      FAMILY_HISTORY_SECTION,
      familyHistoryOrganizer('<code nullFlavor="UNK"/>', familyHistoryObservation(hypertension))
    );

    const [history] = resourcesOfType<FamilyMemberHistory>(bundle, 'FamilyMemberHistory');
    expect(history.relationship).toEqual({
      extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason', valueCode: 'unknown' }],
    });
  });
});

describe('organizer templates', () => {
  function organizer(templateIdsXml: string): string {
    return `<entry typeCode="DRIV">
      <organizer classCode="CLUSTER" moodCode="EVN">
        ${templateIdsXml}
        <code code="46680005" codeSystem="2.16.840.1.113883.6.96" displayName="Vital signs"/>
        <statusCode code="completed"/>
        <component>
          <observation classCode="OBS" moodCode="EVN">
            <templateId root="2.16.840.1.113883.10.20.22.4.27" extension="2014-06-09"/>
            <code code="8867-4" codeSystem="2.16.840.1.113883.6.1" displayName="Heart rate"/>
            <statusCode code="completed"/>
            <value xsi:type="PQ" value="72" unit="/min"/>
          </observation>
        </component>
      </organizer>
    </entry>`;
  }

  test.each([
    ['Vital Signs Organizer', '<templateId root="2.16.840.1.113883.10.20.22.4.26" extension="2015-08-01"/>'],
    ['Result Organizer', '<templateId root="2.16.840.1.113883.10.20.22.4.1" extension="2015-08-01"/>'],
    ['Functional Status Organizer', '<templateId root="2.16.840.1.113883.10.20.22.4.66" extension="2014-06-09"/>'],
    [
      'Result Organizer after another template',
      '<templateId root="2.16.840.1.113883.19.5.99"/><templateId root="2.16.840.1.113883.10.20.22.4.1"/>',
    ],
  ])('converts a %s to Observations', (_name, templateIdsXml) => {
    const bundle = convertSection(RESULTS_SECTION, organizer(templateIdsXml));

    const observations = resourcesOfType<Observation>(bundle, 'Observation');
    expect(observations.map((o) => o.code?.coding?.[0]?.code)).toEqual(['8867-4', '46680005']);
  });

  test('skips an unknown organizer template with ignoreUnsupportedSections, and throws without it', () => {
    const entry = organizer('<templateId root="9.9.9999"/>');

    expect(() => convertSection(RESULTS_SECTION, entry)).toThrow('Unhandled organizer templateId: 9.9.9999');

    const bundle = convertSection(RESULTS_SECTION, entry, { ignoreUnsupportedSections: true });
    expect(resourcesOfType<Observation>(bundle, 'Observation')).toEqual([]);
  });
});
