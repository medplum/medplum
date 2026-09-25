// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AllergyIntolerance, Bundle, Immunization, MedicationRequest } from '@medplum/fhirtypes';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { convertCcdaToFhir } from './ccda-to-fhir';
import { CCDA_NARRATIVE_REFERENCE_URL } from './systems';
import { convertXmlToCcda } from './xml';

const testDataFolder = resolve(__dirname, '../testdata');

describe('nullFlavor handling', () => {
  test('lotNumberText with nullFlavor is omitted from Immunization', () => {
    const ccda = convertXmlToCcda(readFileSync(join(testDataFolder, 'ImmunizationNullFlavorLotNumber.xml'), 'utf8'));
    const bundle = convertCcdaToFhir(ccda);
    const immunization = bundle.entry?.find((e) => e.resource?.resourceType === 'Immunization')
      ?.resource as Immunization;
    expect(immunization).toBeDefined();
    expect(immunization.lotNumber).toBeUndefined();
  });

  test('code with nullFlavor and translation produces clean coding array', () => {
    const ccda = convertXmlToCcda(
      readFileSync(join(testDataFolder, 'ImmunizationNullFlavorCodeWithTranslation.xml'), 'utf8')
    );
    const bundle = convertCcdaToFhir(ccda);
    const immunization = bundle.entry?.find((e) => e.resource?.resourceType === 'Immunization')
      ?.resource as Immunization;
    expect(immunization).toBeDefined();

    const codings = immunization.vaccineCode?.coding;
    expect(codings).toBeDefined();
    expect(codings?.length).toBe(1);
    expect(codings?.[0]).toEqual({
      system: 'http://loinc.org',
      code: '75320-2',
      display: 'Advance directive',
    });
    for (const coding of codings ?? []) {
      expect(coding).not.toBeNull();
    }
  });

  test('allergy reaction with nullFlavor UNK value does not crash', () => {
    const ccda = convertXmlToCcda(readFileSync(join(testDataFolder, 'AllergyNullFlavorReaction.xml'), 'utf8'));
    const bundle = convertCcdaToFhir(ccda);
    const allergy = bundle.entry?.find((e) => e.resource?.resourceType === 'AllergyIntolerance')
      ?.resource as AllergyIntolerance;
    expect(allergy).toBeDefined();
    expect(allergy.code?.coding?.[0]?.code).toBe('2670');
    expect(allergy.reaction).toHaveLength(1);
    expect(allergy.reaction?.[0]?.manifestation?.[0]?.extension?.[0]?.url).toBe(
      'http://hl7.org/fhir/StructureDefinition/data-absent-reason'
    );
  });

  test('routeCode with single translation element does not crash', () => {
    const ccda = convertXmlToCcda(
      readFileSync(join(testDataFolder, 'MedicationRouteCodeSingleTranslation.xml'), 'utf8')
    );
    const bundle = convertCcdaToFhir(ccda);
    const medRequest = bundle.entry?.find((e) => e.resource?.resourceType === 'MedicationRequest')
      ?.resource as MedicationRequest;
    expect(medRequest).toBeDefined();
    expect(medRequest.dosageInstruction?.[0]?.route?.coding).toHaveLength(2);
    expect(medRequest.dosageInstruction?.[0]?.route?.coding?.[1]?.code).toBe('PO');
  });
});

describe('originalText narrative reference resolution', () => {
  function bundleFromSections(sectionsXml: string): Bundle {
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
      ${sectionsXml}
    </structuredBody>
  </component>
</ClinicalDocument>`;
    return convertCcdaToFhir(convertXmlToCcda(xml));
  }

  function medicationSection(medicationCodeXml: string, narrativeRowsXml: string): string {
    return `<component>
      <section>
        <templateId root="2.16.840.1.113883.10.20.22.2.1.1" extension="2014-06-09"/>
        <code code="10160-0" codeSystem="2.16.840.1.113883.6.1"/>
        <title>Medications</title>
        <text>
          <table><tbody>
            ${narrativeRowsXml}
          </tbody></table>
        </text>
        <entry typeCode="DRIV">
          <substanceAdministration classCode="SBADM" moodCode="EVN">
            <templateId root="2.16.840.1.113883.10.20.22.4.16" extension="2014-06-09"/>
            <id root="2.16.840.1.113883.19.5" extension="MED-1"/>
            <statusCode code="active"/>
            <consumable><manufacturedProduct classCode="MANU">
              <templateId root="2.16.840.1.113883.10.20.22.4.23" extension="2014-06-09"/>
              <manufacturedMaterial>
                ${medicationCodeXml}
              </manufacturedMaterial>
            </manufacturedProduct></consumable>
          </substanceAdministration>
        </entry>
      </section>
    </component>`;
  }

  function medicationRequestFromSections(sectionsXml: string): MedicationRequest {
    const bundle = bundleFromSections(sectionsXml);
    const medRequest = bundle.entry?.find((e) => e.resource?.resourceType === 'MedicationRequest')
      ?.resource as MedicationRequest;
    expect(medRequest).toBeDefined();
    return medRequest;
  }

  test('resolves an originalText reference to the narrative instead of emitting the pointer', () => {
    const medRequest = medicationRequestFromSections(
      medicationSection(
        `<code code="310793" codeSystem="2.16.840.1.113883.6.88">
           <originalText><reference value="#Med0Name"/></originalText>
         </code>`,
        `<tr><td ID="Med0Name">Examplamide 10 MG Oral Tablet</td></tr>
         <tr><td ID="Med1Name">Placebocillin 250 MG Oral Capsule</td></tr>`
      )
    );
    // The resolved drug name is shown; the raw "#Med0Name" pointer is never the text.
    expect(medRequest.medicationCodeableConcept?.text).toBe('Examplamide 10 MG Oral Tablet');
    expect(medRequest.medicationCodeableConcept?.coding?.[0]).toMatchObject({
      system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
      code: '310793',
    });
    // The pointer is preserved in the narrative-reference extension for round-tripping.
    expect(medRequest.medicationCodeableConcept?.extension?.[0]).toMatchObject({
      url: CCDA_NARRATIVE_REFERENCE_URL,
      valueString: '#Med0Name',
    });
  });

  test('resolves an originalText reference on a nullFlavored allergen code', () => {
    const bundle = bundleFromSections(`<component>
      <section>
        <templateId root="2.16.840.1.113883.10.20.22.2.6.1"/>
        <code code="48765-2" codeSystem="2.16.840.1.113883.6.1"/>
        <title>Allergies</title>
        <text>
          <table><tbody>
            <tr><td ID="Allergen1">Peanut (Arachis hypogaea)</td></tr>
          </tbody></table>
        </text>
        <entry>
          <act classCode="ACT" moodCode="EVN">
            <templateId root="2.16.840.1.113883.10.20.22.4.30"/>
            <id root="a1b2c3d4-e5f6-7890-abcd-ef1234567890"/>
            <code code="CONC" codeSystem="2.16.840.1.113883.5.6"/>
            <statusCode code="active"/>
            <entryRelationship typeCode="SUBJ">
              <observation classCode="OBS" moodCode="EVN">
                <templateId root="2.16.840.1.113883.10.20.22.4.7"/>
                <id root="0fffb34f-c1e0-47c2-92af-c414a3ff21ec"/>
                <code code="ASSERTION" codeSystem="2.16.840.1.113883.5.4"/>
                <statusCode code="completed"/>
                <value xsi:type="CD" code="414285001" displayName="Allergy to food (finding)" codeSystem="2.16.840.1.113883.6.96"/>
                <participant typeCode="CSM">
                  <participantRole classCode="MANU">
                    <playingEntity classCode="MMAT">
                      <code nullFlavor="UNK">
                        <originalText><reference value="#Allergen1"/></originalText>
                      </code>
                    </playingEntity>
                  </participantRole>
                </participant>
              </observation>
            </entryRelationship>
          </act>
        </entry>
      </section>
    </component>`);
    const allergy = bundle.entry?.find((e) => e.resource?.resourceType === 'AllergyIntolerance')
      ?.resource as AllergyIntolerance;
    expect(allergy).toBeDefined();
    expect(allergy.code?.text).toBe('Peanut (Arachis hypogaea)');
    expect(allergy.code?.text).not.toContain('#');
    expect(allergy.code?.extension?.[0]).toMatchObject({
      url: CCDA_NARRATIVE_REFERENCE_URL,
      valueString: '#Allergen1',
    });
  });

  test('inline originalText content takes precedence over the reference', () => {
    const medRequest = medicationRequestFromSections(
      medicationSection(
        `<code code="310793" codeSystem="2.16.840.1.113883.6.88">
           <originalText>Examplamide 20 MG Oral Tablet<reference value="#Med0Name"/></originalText>
         </code>`,
        `<tr><td ID="Med0Name">Examplamide 10 MG Oral Tablet</td></tr>`
      )
    );
    expect(medRequest.medicationCodeableConcept?.text).toBe('Examplamide 20 MG Oral Tablet');
  });

  test('an unresolvable reference leaves text unset but keeps the pointer in the extension', () => {
    const medRequest = medicationRequestFromSections(
      medicationSection(
        `<code code="310793" codeSystem="2.16.840.1.113883.6.88">
           <originalText><reference value="#Missing"/></originalText>
         </code>`,
        `<tr><td ID="Med0Name">Examplamide 10 MG Oral Tablet</td></tr>`
      )
    );
    expect(medRequest.medicationCodeableConcept?.coding).toHaveLength(1);
    expect(medRequest.medicationCodeableConcept?.text).toBeUndefined();
    expect(medRequest.medicationCodeableConcept?.extension?.[0]).toMatchObject({
      url: CCDA_NARRATIVE_REFERENCE_URL,
      valueString: '#Missing',
    });
  });

  test('a duplicated narrative ID is treated as ambiguous and never emitted as text', () => {
    const medRequest = medicationRequestFromSections(
      medicationSection(
        `<code code="310793" codeSystem="2.16.840.1.113883.6.88">
           <originalText><reference value="#Dup"/></originalText>
         </code>`,
        `<tr><td ID="Dup">Drug A 10 MG</td></tr>
         <tr><td ID="Dup">Drug B 20 MG</td></tr>`
      )
    );
    expect(medRequest.medicationCodeableConcept?.coding).toHaveLength(1);
    expect(medRequest.medicationCodeableConcept?.text).toBeUndefined();
  });
});
