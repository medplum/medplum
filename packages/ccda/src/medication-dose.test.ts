// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { UCUM } from '@medplum/core';
import type { DosageDoseAndRate, MedicationRequest } from '@medplum/fhirtypes';
import { convertCcdaToFhir } from './ccda-to-fhir';
import { convertXmlToCcda } from './xml';

describe('medication doseQuantity', () => {
  function doseAndRateFromXml(doseQuantityXml: string): DosageDoseAndRate[] | undefined {
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
          <templateId root="2.16.840.1.113883.10.20.22.2.1.1" extension="2014-06-09"/>
          <code code="10160-0" codeSystem="2.16.840.1.113883.6.1"/>
          <entry>
            <substanceAdministration classCode="SBADM" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.16" extension="2014-06-09"/>
              <id root="f1a2b3c4-d5e6-7890-abcd-ef1234567890"/>
              <statusCode code="active"/>
              ${doseQuantityXml}
              <consumable>
                <manufacturedProduct classCode="MANU">
                  <manufacturedMaterial>
                    <code code="197806" displayName="Ibuprofen 600 MG Oral Tablet" codeSystem="2.16.840.1.113883.6.88"/>
                  </manufacturedMaterial>
                </manufacturedProduct>
              </consumable>
            </substanceAdministration>
          </entry>
        </section>
      </component>
    </structuredBody>
  </component>
</ClinicalDocument>`;
    const bundle = convertCcdaToFhir(convertXmlToCcda(xml));
    const medicationRequest = bundle.entry?.find((e) => e.resource?.resourceType === 'MedicationRequest')
      ?.resource as MedicationRequest;
    expect(medicationRequest).toBeDefined();
    return medicationRequest.dosageInstruction?.[0]?.doseAndRate;
  }

  test('maps value and UCUM unit from the document', () => {
    expect(doseAndRateFromXml('<doseQuantity value="500" unit="mg"/>')).toEqual([
      { doseQuantity: { value: 500, unit: 'mg', system: UCUM, code: 'mg' } },
    ]);
  });

  test('does not invent a unit when the document has none', () => {
    expect(doseAndRateFromXml('<doseQuantity value="1"/>')).toEqual([{ doseQuantity: { value: 1 } }]);
  });

  test('maps an IVL_PQ dose range to doseRange', () => {
    expect(
      doseAndRateFromXml(`<doseQuantity xsi:type="IVL_PQ">
        <low value="1" unit="{tbl}"/>
        <high value="2" unit="{tbl}"/>
      </doseQuantity>`)
    ).toEqual([
      {
        doseRange: {
          low: { value: 1, unit: '{tbl}', system: UCUM, code: '{tbl}' },
          high: { value: 2, unit: '{tbl}', system: UCUM, code: '{tbl}' },
        },
      },
    ]);
  });

  test('omits the dose when it has a nullFlavor', () => {
    expect(doseAndRateFromXml('<doseQuantity nullFlavor="UNK"/>')).toBeUndefined();
    expect(doseAndRateFromXml('<doseQuantity nullFlavor="UNK" unit="mg"/>')).toBeUndefined();
  });
});
