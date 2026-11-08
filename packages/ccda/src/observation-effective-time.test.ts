// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bundle, Observation } from '@medplum/fhirtypes';
import { convertCcdaToFhir } from './ccda-to-fhir';
import { convertXmlToCcda } from './xml';

const PANEL_CODE = '58410-2';
const RESULT_CODE = '718-7';

function convertResults(organizerEffectiveTime: string, observationEffectiveTime: string): Bundle {
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
              <code code="${PANEL_CODE}" codeSystem="2.16.840.1.113883.6.1" displayName="CBC panel - Blood by Automated count"/>
              <statusCode code="completed"/>
              ${organizerEffectiveTime}
              <component>
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.2" extension="2015-08-01"/>
                  <id root="2.16.840.1.113883.19.5" extension="LAB-1-1"/>
                  <code code="${RESULT_CODE}" codeSystem="2.16.840.1.113883.6.1" displayName="Hemoglobin [Mass/volume] in Blood"/>
                  <statusCode code="completed"/>
                  ${observationEffectiveTime}
                  <value xsi:type="PQ" value="13.5" unit="g/dL"/>
                </observation>
              </component>
            </organizer>
          </entry>
        </section>
      </component>
    </structuredBody>
  </component>
</ClinicalDocument>`;
  return convertCcdaToFhir(convertXmlToCcda(xml));
}

function findObservation(bundle: Bundle, code: string): Observation {
  const observation = bundle.entry?.find(
    (e) => e.resource?.resourceType === 'Observation' && e.resource.code?.coding?.[0]?.code === code
  )?.resource as Observation;
  expect(observation).toBeDefined();
  return observation;
}

function effectiveOf(observation: Observation): Pick<Observation, 'effectiveDateTime' | 'effectivePeriod'> {
  return { effectiveDateTime: observation.effectiveDateTime, effectivePeriod: observation.effectivePeriod };
}

const cases: [string, string, Pick<Observation, 'effectiveDateTime' | 'effectivePeriod'>][] = [
  ['a point in time', '<effectiveTime value="20260101"/>', { effectiveDateTime: '2026-01-01' }],
  [
    'an interval with only a low',
    '<effectiveTime><low value="20260102130553-0800"/></effectiveTime>',
    { effectiveDateTime: '2026-01-02T13:05:53-08:00' },
  ],
  [
    'an interval with a low and a nullFlavor high',
    '<effectiveTime><low value="20260103"/><high nullFlavor="UNK"/></effectiveTime>',
    { effectiveDateTime: '2026-01-03' },
  ],
  [
    'an interval whose low equals its high',
    '<effectiveTime><low value="20260104150700+0000"/><high value="20260104150700+0000"/></effectiveTime>',
    { effectiveDateTime: '2026-01-04T15:07:00Z' },
  ],
  [
    'an interval with a different high',
    '<effectiveTime><low value="20260105000000-0800"/><high value="20260115131200-0800"/></effectiveTime>',
    { effectivePeriod: { start: '2026-01-05T00:00:00-08:00', end: '2026-01-15T13:12:00-08:00' } },
  ],
  [
    'an interval with only a high',
    '<effectiveTime><low nullFlavor="NINF"/><high value="20260106"/></effectiveTime>',
    { effectivePeriod: { end: '2026-01-06' } },
  ],
  ['a nullFlavor', '<effectiveTime nullFlavor="UNK"/>', {}],
  ['an interval of nullFlavors', '<effectiveTime><low nullFlavor="NINF"/><high nullFlavor="NA"/></effectiveTime>', {}],
  ['no effectiveTime', '', {}],
];

describe('observation effectiveTime', () => {
  test.each(cases)('maps %s on a result observation', (_name, effectiveTimeXml, expected) => {
    const bundle = convertResults('', effectiveTimeXml);
    expect(effectiveOf(findObservation(bundle, RESULT_CODE))).toEqual(expected);
  });

  test.each(cases)('maps %s on a result organizer', (_name, effectiveTimeXml, expected) => {
    const bundle = convertResults(effectiveTimeXml, '');
    expect(effectiveOf(findObservation(bundle, PANEL_CODE))).toEqual(expected);
  });
});
