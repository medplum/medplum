// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { CcdaViewer } from './CcdaViewer';

export default {
  title: 'Medplum/CcdaViewer',
  component: CcdaViewer,
} as Meta;

// Trimmed from the ONC 170.315(b)(1) CCD sample in packages/ccda/testdata
const SAMPLE_CCD = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3">
  <code code="34133-9" displayName="Summarization of Episode Note" codeSystem="2.16.840.1.113883.6.1"/>
  <title>Continuity of Care Document</title>
  <effectiveTime value="20150722"/>
  <recordTarget>
    <patientRole>
      <id extension="112233334" root="2.16.840.1.113883.4.1"/>
      <addr use="HP">
        <streetAddressLine>1002 Amber Dr</streetAddressLine>
        <city>Beaverton</city><state>OR</state><postalCode>97006</postalCode><country>US</country>
      </addr>
      <telecom value="tel:+1(555)-113-1234" use="MC"/>
      <patient>
        <name use="L"><given>Thomas</given><given>V</given><family>Manfred</family><suffix>jr</suffix></name>
        <administrativeGenderCode code="M" displayName="Male" codeSystem="2.16.840.1.113883.5.1"/>
        <birthTime value="19800701"/>
        <raceCode code="2106-3" displayName="White" codeSystem="2.16.840.1.113883.6.238"/>
        <ethnicGroupCode code="2186-5" displayName="Not Hispanic or Latino" codeSystem="2.16.840.1.113883.6.238"/>
        <languageCommunication><languageCode code="en-US"/></languageCommunication>
      </patient>
    </patientRole>
  </recordTarget>
  <author>
    <time value="20150722"/>
    <assignedAuthor>
      <id extension="111111" root="2.16.840.1.113883.4.6"/>
      <assignedAuthoringDevice><softwareName>Amb EMR v1.0</softwareName></assignedAuthoringDevice>
      <representedOrganization><name>Neighborhood Physicians Practice</name></representedOrganization>
    </assignedAuthor>
  </author>
  <custodian>
    <assignedCustodian>
      <representedCustodianOrganization><name>Neighborhood Physicians Practice</name></representedCustodianOrganization>
    </assignedCustodian>
  </custodian>
  <documentationOf>
    <serviceEvent classCode="PCPR"><effectiveTime><low value="20150622"/><high value="20150722"/></effectiveTime></serviceEvent>
  </documentationOf>
  <component>
    <structuredBody>
      <component>
        <section>
          <code code="48765-2" codeSystem="2.16.840.1.113883.6.1"/>
          <title>ALLERGIES AND ADVERSE REACTIONS</title>
          <text>
            <table>
              <thead><tr><th>Substance</th><th>Reaction</th><th>Severity</th><th>Status</th></tr></thead>
              <tbody>
                <tr><td>Penicillin G benzathine</td><td>Hives</td><td>Moderate</td><td>Active</td></tr>
                <tr><td>Ampicillin</td><td>Hives</td><td>Moderate</td><td>Active</td></tr>
                <tr><td>Ampicillin</td><td>Hives</td><td>Moderate</td><td>Active</td></tr>
              </tbody>
            </table>
          </text>
        </section>
      </component>
      <component>
        <section>
          <code code="10160-0" codeSystem="2.16.840.1.113883.6.1"/>
          <title>MEDICATIONS</title>
          <text>
            <table>
              <thead><tr><th>Medication</th><th>Directions</th><th>Start Date</th><th>Status</th></tr></thead>
              <tbody>
                <tr><td>Albuterol 0.09 MG/ACTUAT inhalant solution</td><td>2 puffs once</td><td>20150622</td><td>Active</td></tr>
                <tr><td>Albuterol 0.09 MG/ACTUAT inhalant solution</td><td>2 puffs as needed</td><td>20150701</td><td>Active</td></tr>
              </tbody>
            </table>
          </text>
        </section>
      </component>
      <component>
        <section>
          <code code="11450-4" codeSystem="2.16.840.1.113883.6.1"/>
          <title>PROBLEMS</title>
          <text>
            <list>
              <item><content styleCode="Bold">Essential hypertension</content>, onset 2015-06-22</item>
              <item>Fever, onset 2015-06-22</item>
            </list>
          </text>
        </section>
      </component>
      <component>
        <section>
          <code code="18776-5" codeSystem="2.16.840.1.113883.6.1"/>
          <title>TREATMENT PLAN</title>
          <text>
            <paragraph>Follow up with Dr Henry Seven in <content styleCode="Italics">two weeks</content>.</paragraph>
            <list listType="ordered">
              <caption>Instructions</caption>
              <item>Get rest</item>
              <item>Drink plenty of fluids</item>
            </list>
          </text>
          <component>
            <section>
              <title>Goals</title>
              <text>Get rid of intermittent fever.</text>
            </section>
          </component>
        </section>
      </component>
    </structuredBody>
  </component>
</ClinicalDocument>`;

export const Basic = (): JSX.Element => (
  <Document>
    <CcdaViewer xml={SAMPLE_CCD} />
  </Document>
);

export const InvalidXml = (): JSX.Element => (
  <Document>
    <CcdaViewer xml="<ClinicalDocument><unclosed>" />
  </Document>
);
