// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { UCUM } from '@medplum/core';
import type { Observation } from '@medplum/fhirtypes';
import { convertCcdaToFhir } from './ccda-to-fhir';
import { convertXmlToCcda } from './xml';

describe('observation value', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function resultFromXml(valueXml: string): Observation {
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
          <templateId root="2.16.840.1.113883.10.20.22.2.3.1" extension="2015-08-01"/>
          <code code="30954-2" codeSystem="2.16.840.1.113883.6.1"/>
          <entry>
            <organizer classCode="BATTERY" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.1" extension="2015-08-01"/>
              <id root="2.16.840.1.113883.19.5" extension="LAB-1"/>
              <code code="34528-0" codeSystem="2.16.840.1.113883.6.1" displayName="Coagulation panel"/>
              <statusCode code="completed"/>
              <component>
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.2" extension="2015-08-01"/>
                  <id root="2.16.840.1.113883.19.5" extension="LAB-1-1"/>
                  <code code="6301-6" codeSystem="2.16.840.1.113883.6.1" displayName="INR in Platelet poor plasma by Coagulation assay"/>
                  <statusCode code="completed"/>
                  ${valueXml}
                </observation>
              </component>
            </organizer>
          </entry>
        </section>
      </component>
    </structuredBody>
  </component>
</ClinicalDocument>`;
    const bundle = convertCcdaToFhir(convertXmlToCcda(xml));
    const result = bundle.entry?.find(
      (e) => e.resource?.resourceType === 'Observation' && e.resource.code?.coding?.[0]?.code === '6301-6'
    )?.resource as Observation;
    expect(result).toBeDefined();
    return result;
  }

  test('maps a REAL value to valueQuantity without a unit', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(resultFromXml('<value xsi:type="REAL" value="1.1"/>').valueQuantity).toEqual({ value: 1.1 });
    expect(warn).not.toHaveBeenCalled();
  });

  test('keeps the unit of a REAL value that carries one', () => {
    expect(resultFromXml('<value xsi:type="REAL" value="7.4" unit="[pH]"/>').valueQuantity).toEqual({
      value: 7.4,
      unit: '[pH]',
      system: UCUM,
      code: '[pH]',
    });
  });

  test('omits a REAL value without a number', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(resultFromXml('<value xsi:type="REAL"/>').valueQuantity).toBeUndefined();
    expect(resultFromXml('<value xsi:type="REAL" nullFlavor="UNK"/>').valueQuantity).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });
});
