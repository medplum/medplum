// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AllergyIntolerance, Bundle, CodeableConcept, MedicationRequest, Observation } from '@medplum/fhirtypes';
import { convertCcdaToFhir } from './ccda-to-fhir';
import { CCDA_NARRATIVE_REFERENCE_URL } from './systems';
import { convertXmlToCcda } from './xml';

function convertSections(sectionsXml: string): Bundle {
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

describe('narrative references in codes', () => {
  function medicationCodeFromXml(codeXml: string, narrativeXml: string): CodeableConcept | undefined {
    const bundle = convertSections(`<component>
      <section>
        <templateId root="2.16.840.1.113883.10.20.22.2.1.1" extension="2014-06-09"/>
        <code code="10160-0" codeSystem="2.16.840.1.113883.6.1"/>
        <title>Medications</title>
        <text>${narrativeXml}</text>
        <entry typeCode="DRIV">
          <substanceAdministration classCode="SBADM" moodCode="EVN">
            <templateId root="2.16.840.1.113883.10.20.22.4.16" extension="2014-06-09"/>
            <id root="2.16.840.1.113883.19.5" extension="MED-1"/>
            <statusCode code="active"/>
            <consumable>
              <manufacturedProduct classCode="MANU">
                <templateId root="2.16.840.1.113883.10.20.22.4.23" extension="2014-06-09"/>
                <manufacturedMaterial>${codeXml}</manufacturedMaterial>
              </manufacturedProduct>
            </consumable>
          </substanceAdministration>
        </entry>
      </section>
    </component>`);
    const medicationRequest = bundle.entry?.find((e) => e.resource?.resourceType === 'MedicationRequest')
      ?.resource as MedicationRequest;
    expect(medicationRequest).toBeDefined();
    return medicationRequest.medicationCodeableConcept;
  }

  const medicationTable = `<table><tbody>
    <tr><td ID="Med0Name">Examplamide 10 MG Oral Tablet</td></tr>
    <tr><td ID="Med1Name">Placebocillin 250 MG Oral Capsule</td></tr>
  </tbody></table>`;

  test('resolves an originalText reference into the text', () => {
    expect(
      medicationCodeFromXml(
        `<code code="310793" codeSystem="2.16.840.1.113883.6.88">
          <originalText><reference value="#Med0Name"/></originalText>
        </code>`,
        medicationTable
      )
    ).toEqual({
      coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '310793' }],
      text: 'Examplamide 10 MG Oral Tablet',
      extension: [{ url: CCDA_NARRATIVE_REFERENCE_URL, valueString: '#Med0Name' }],
    });
  });

  test('resolves an ID on an element nested in the narrative', () => {
    const concept = medicationCodeFromXml(
      `<code code="310793" codeSystem="2.16.840.1.113883.6.88">
        <originalText><reference value="#Med0Name"/></originalText>
      </code>`,
      `<table><tbody><tr>
        <td><content ID="Med0Name">Examplamide
          10 MG Oral Tablet</content></td>
        <td>Take one daily</td>
      </tr></tbody></table>`
    );
    expect(concept?.text).toBe('Examplamide 10 MG Oral Tablet');
  });

  test('prefers inline originalText text to the reference', () => {
    const concept = medicationCodeFromXml(
      `<code code="310793" codeSystem="2.16.840.1.113883.6.88">
        <originalText>Examplamide 20 MG Oral Tablet<reference value="#Med0Name"/></originalText>
      </code>`,
      medicationTable
    );
    expect(concept?.text).toBe('Examplamide 20 MG Oral Tablet');
  });

  test('leaves the text unset when the reference does not resolve', () => {
    const concept = medicationCodeFromXml(
      `<code code="310793" codeSystem="2.16.840.1.113883.6.88">
        <originalText><reference value="#Missing"/></originalText>
      </code>`,
      medicationTable
    );
    expect(concept?.text).toBeUndefined();
    expect(concept?.coding).toHaveLength(1);
    expect(concept?.extension).toEqual([{ url: CCDA_NARRATIVE_REFERENCE_URL, valueString: '#Missing' }]);
  });

  test('does not resolve an ID that appears more than once in the document', () => {
    const concept = medicationCodeFromXml(
      `<code code="310793" codeSystem="2.16.840.1.113883.6.88">
        <originalText><reference value="#Dup"/></originalText>
      </code>`,
      `<table><tbody>
        <tr><td ID="Dup">Examplamide 10 MG Oral Tablet</td></tr>
        <tr><td ID="Dup">Placebocillin 250 MG Oral Capsule</td></tr>
      </tbody></table>`
    );
    expect(concept?.text).toBeUndefined();
  });

  test('resolves the reference of a nullFlavored allergen code', () => {
    const bundle = convertSections(`<component>
      <section>
        <templateId root="2.16.840.1.113883.10.20.22.2.6.1" extension="2015-08-01"/>
        <code code="48765-2" codeSystem="2.16.840.1.113883.6.1"/>
        <title>Allergies</title>
        <text><list><item ID="Allergen1">Peanut</item></list></text>
        <entry typeCode="DRIV">
          <act classCode="ACT" moodCode="EVN">
            <templateId root="2.16.840.1.113883.10.20.22.4.30" extension="2015-08-01"/>
            <id root="2.16.840.1.113883.19.5" extension="ALG-1"/>
            <code code="CONC" codeSystem="2.16.840.1.113883.5.6"/>
            <statusCode code="active"/>
            <entryRelationship typeCode="SUBJ">
              <observation classCode="OBS" moodCode="EVN">
                <templateId root="2.16.840.1.113883.10.20.22.4.7" extension="2014-06-09"/>
                <id root="2.16.840.1.113883.19.5" extension="ALG-1-1"/>
                <code code="ASSERTION" codeSystem="2.16.840.1.113883.5.4"/>
                <statusCode code="completed"/>
                <value xsi:type="CD" code="414285001" codeSystem="2.16.840.1.113883.6.96" displayName="Allergy to food (finding)"/>
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
    expect(allergy.code).toEqual({
      text: 'Peanut',
      extension: [{ url: CCDA_NARRATIVE_REFERENCE_URL, valueString: '#Allergen1' }],
    });
  });
});

describe('ED observation values', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function resultFromXml(valueXml: string): Observation {
    const bundle = convertSections(`<component>
      <section>
        <templateId root="2.16.840.1.113883.10.20.22.2.3.1" extension="2015-08-01"/>
        <code code="30954-2" codeSystem="2.16.840.1.113883.6.1"/>
        <title>Results</title>
        <text>
          <paragraph ID="ResultNarrative1">Impression:
            no acute cardiopulmonary process.</paragraph>
        </text>
        <entry typeCode="DRIV">
          <organizer classCode="BATTERY" moodCode="EVN">
            <templateId root="2.16.840.1.113883.10.20.22.4.1" extension="2015-08-01"/>
            <id root="2.16.840.1.113883.19.5" extension="IMG-1"/>
            <code code="36643-5" codeSystem="2.16.840.1.113883.6.1" displayName="XR Chest 2 Views"/>
            <statusCode code="completed"/>
            <component>
              <observation classCode="OBS" moodCode="EVN">
                <templateId root="2.16.840.1.113883.10.20.22.4.2" extension="2015-08-01"/>
                <id root="2.16.840.1.113883.19.5" extension="IMG-1-1"/>
                <code code="18782-3" codeSystem="2.16.840.1.113883.6.1" displayName="Radiology Study observation (narrative)"/>
                <statusCode code="completed"/>
                ${valueXml}
              </observation>
            </component>
          </organizer>
        </entry>
      </section>
    </component>`);
    const result = bundle.entry?.find(
      (e) => e.resource?.resourceType === 'Observation' && e.resource.code?.coding?.[0]?.code === '18782-3'
    )?.resource as Observation;
    expect(result).toBeDefined();
    return result;
  }

  test('maps a reference into the narrative to valueString', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = resultFromXml('<value xsi:type="ED"><reference value="#ResultNarrative1"/></value>');
    expect(result.valueString).toBe('Impression: no acute cardiopulmonary process.');
    expect(warn).not.toHaveBeenCalled();
  });

  test('maps inline text to valueString', () => {
    const result = resultFromXml('<value xsi:type="ED" mediaType="text/plain">No acute fracture.</value>');
    expect(result.valueString).toBe('No acute fracture.');
  });

  test('gives no value for a reference that does not resolve', () => {
    const result = resultFromXml('<value xsi:type="ED"><reference value="#Missing"/></value>');
    expect(result.valueString).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('#Missing');
  });

  test('leaves content that is not text unmapped, with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pdf = resultFromXml('<value xsi:type="ED" mediaType="application/pdf" representation="B64">JVBERi0=</value>');
    const base64Text = resultFromXml('<value xsi:type="ED" representation="B64">Tm8gYWN1dGUgZnJhY3R1cmUu</value>');
    expect(pdf.valueString).toBeUndefined();
    expect(base64Text.valueString).toBeUndefined();
    expect(warn).toHaveBeenCalledWith('Unhandled observation value type: ED (application/pdf, B64)');
    expect(warn).toHaveBeenCalledWith('Unhandled observation value type: ED (text/plain, B64)');
  });
});
