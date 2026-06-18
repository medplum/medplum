// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Patient } from '@medplum/fhirtypes';
import { convertCcdaToFhir } from './ccda-to-fhir';
import { convertXmlToCcda } from './xml';

/**
 * Address parts that carry an XML attribute (e.g. the HL7 `partType` on ADXP
 * elements) are parsed by fast-xml-parser into `{ '#text': value, '@_partType': ... }`
 * objects rather than bare strings. `mapAddresses` must normalize these via
 * `nodeToString` (as the name mapper already does), otherwise the raw parser
 * artifacts leak into the FHIR `Address` and downstream validation/persistence
 * rejects the resource (a non-string `city` breaks `city.trim()`).
 */
describe('address text-node normalization', () => {
  function patientFromXml(addrXml: string): Patient {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3">
  <recordTarget>
    <patientRole>
      ${addrXml}
      <patient>
        <name use="L"><given>Jane</given><family>Doe</family></name>
      </patient>
    </patientRole>
  </recordTarget>
</ClinicalDocument>`;
    const bundle = convertCcdaToFhir(convertXmlToCcda(xml));
    return bundle.entry?.find((e) => e.resource?.resourceType === 'Patient')?.resource as Patient;
  }

  test('strips partType attribute artifacts from address parts', () => {
    const patient = patientFromXml(`<addr use="HP">
        <streetAddressLine partType="SAL">742 Evergreen Terrace</streetAddressLine>
        <city partType="CTY">Springfield</city>
        <state partType="STA">IL</state>
        <postalCode partType="ZIP">62704</postalCode>
        <country partType="CNT">US</country>
      </addr>`);

    const address = patient.address?.[0];
    expect(address?.line).toEqual(['742 Evergreen Terrace']);
    expect(address?.city).toBe('Springfield');
    expect(address?.state).toBe('IL');
    expect(address?.postalCode).toBe('62704');
    expect(address?.country).toBe('US');

    // None of the fields should leak the parser's object representation.
    for (const value of [address?.city, address?.state, address?.postalCode, address?.country]) {
      expect(typeof value).toBe('string');
    }
    const serialized = JSON.stringify(address);
    expect(serialized).not.toContain('#text');
    expect(serialized).not.toContain('@_partType');
  });

  test('plain string address parts are unchanged', () => {
    const patient = patientFromXml(`<addr use="HP">
        <streetAddressLine>742 Evergreen Terrace</streetAddressLine>
        <city>Springfield</city>
        <state>IL</state>
        <postalCode>62704</postalCode>
      </addr>`);

    const address = patient.address?.[0];
    expect(address?.line).toEqual(['742 Evergreen Terrace']);
    expect(address?.city).toBe('Springfield');
    expect(address?.state).toBe('IL');
    expect(address?.postalCode).toBe('62704');
  });
});
