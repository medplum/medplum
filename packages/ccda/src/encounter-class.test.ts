// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { CPT } from '@medplum/core';
import type { Encounter } from '@medplum/fhirtypes';
import { convertCcdaToFhir } from './ccda-to-fhir';
import { OID_ACT_CODE_CODE_SYSTEM, OID_CPT_CODE_SYSTEM, OID_SNOMED_CT_CODE_SYSTEM } from './oids';
import { ACT_CODE_SYSTEM } from './systems';
import { convertXmlToCcda } from './xml';

const AMBULATORY = { system: ACT_CODE_SYSTEM, code: 'AMB', display: 'ambulatory' };
const DATA_ABSENT = {
  extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason', valueCode: 'unknown' }],
};

function convertEncounter(code: string): Encounter {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3">
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
          <templateId root="2.16.840.1.113883.10.20.22.2.22.1" extension="2015-08-01"/>
          <code code="46240-8" codeSystem="2.16.840.1.113883.6.1"/>
          <entry>
            <encounter classCode="ENC" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.49" extension="2015-08-01"/>
              <id root="00000000-0000-4000-8000-0000000000e1"/>
              ${code}
              <effectiveTime value="20250101"/>
            </encounter>
          </entry>
        </section>
      </component>
    </structuredBody>
  </component>
</ClinicalDocument>`;
  const bundle = convertCcdaToFhir(convertXmlToCcda(xml));
  const encounter = bundle.entry?.map((e) => e.resource).find((r) => r?.resourceType === 'Encounter');
  expect(encounter).toBeDefined();
  return encounter as Encounter;
}

describe('Encounter.class', () => {
  test.each([
    ['99203', AMBULATORY],
    ['99213', AMBULATORY],
    ['99222', { system: ACT_CODE_SYSTEM, code: 'IMP', display: 'inpatient encounter' }],
    ['99285', { system: ACT_CODE_SYSTEM, code: 'EMER', display: 'emergency' }],
  ])('maps CPT %s to its encounter class', (cpt, expected) => {
    const encounter = convertEncounter(`<code code="${cpt}" codeSystem="${OID_CPT_CODE_SYSTEM}"/>`);
    expect(encounter.class).toEqual(expected);
  });

  test('keeps the CPT code in type', () => {
    const encounter = convertEncounter(
      `<code code="99213" codeSystem="${OID_CPT_CODE_SYSTEM}" displayName="Office outpatient visit"/>`
    );
    expect(encounter.type?.[0]?.coding?.[0]).toEqual({
      system: CPT,
      code: '99213',
      display: 'Office outpatient visit',
    });
  });

  test('takes an ActCode in the root code as the class, keeping its display', () => {
    const encounter = convertEncounter(
      `<code code="HH" codeSystem="${OID_ACT_CODE_CODE_SYSTEM}" displayName="Home visit"/>`
    );
    expect(encounter.class).toEqual({ system: ACT_CODE_SYSTEM, code: 'HH', display: 'Home visit' });
  });

  test('prefers an ActCode translation to a CPT code in the root, with the standard display when it has none', () => {
    const encounter = convertEncounter(
      `<code code="99213" codeSystem="${OID_CPT_CODE_SYSTEM}">
         <translation code="IMP" codeSystem="${OID_ACT_CODE_CODE_SYSTEM}"/>
       </code>`
    );
    expect(encounter.class).toEqual({ system: ACT_CODE_SYSTEM, code: 'IMP', display: 'inpatient encounter' });
  });

  test('ignores an ActCode that is not an encounter code', () => {
    const encounter = convertEncounter(
      `<code code="99213" codeSystem="${OID_CPT_CODE_SYSTEM}">
         <translation code="CONC" codeSystem="${OID_ACT_CODE_CODE_SYSTEM}"/>
       </code>`
    );
    expect(encounter.class).toEqual(AMBULATORY);
  });

  test('maps a CPT translation when the root code is not coded', () => {
    const encounter = convertEncounter(
      `<code nullFlavor="OTH">
         <originalText>Office visit</originalText>
         <translation code="99214" codeSystem="${OID_CPT_CODE_SYSTEM}"/>
       </code>`
    );
    expect(encounter.class).toEqual(AMBULATORY);
  });

  test.each([
    ['a CPT code outside the mapped ranges', `<code code="99385" codeSystem="${OID_CPT_CODE_SYSTEM}"/>`],
    ['a SNOMED code', `<code code="4525004" codeSystem="${OID_SNOMED_CT_CODE_SYSTEM}"/>`],
    ['a code with only text', '<code nullFlavor="OTH"><originalText>Emergency department visit</originalText></code>'],
  ])('marks the class absent for %s, rather than asserting ambulatory', (_, code) => {
    expect(convertEncounter(code).class).toEqual(DATA_ABSENT);
  });

  // sanitizeNullFlavors removes a code that holds only a null flavor, so it converts like a missing code.
  test.each([
    ['no code', ''],
    ['a code with only a null flavor', '<code nullFlavor="UNK"/>'],
  ])('keeps the ambulatory default for %s', (_, code) => {
    expect(convertEncounter(code).class).toEqual(AMBULATORY);
  });
});
