import { MedplumRequestOptions } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen } from '../test-utils/render';
import { XmlDisplay } from './XmlDisplay';

const EXAMPLE_CCDA = `
<ClinicalDocument xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="urn:hl7-org:v3" xmlns:voc="urn:hl7-org:v3/voc" xmlns:sdtc="urn:hl7-org:sdtc">
	<!-- ** CDA Header ** -->
	<realmCode code="US"/>
	<typeId extension="POCD_HD000040" root="2.16.840.1.113883.1.3"/>
	<!-- CCD document template within C-CDA 2.0-->
	<templateId root="2.16.840.1.113883.10.20.22.1.2" extension="2014-06-09"/>
	<!-- Globally unique identifier for the document. Can only be [1..1] -->
	<id extension="EHRVersion2.0" root="be84a8e4-a22e-4210-a4a6-b3c48273e84c"/>
	<code code="34133-9" displayName="Summary of episode note" codeSystem="2.16.840.1.113883.6.1" codeSystemName="LOINC"/>
	<!-- Title of this document -->
	<title>Summary of Patient Chart</title>
	<!-- This is the time of document generation -->
	<effectiveTime value="20141015103026-0500"/>
	<confidentialityCode code="N" displayName="normal" codeSystem="2.16.840.1.113883.5.25" codeSystemName="Confidentiality"/>
	<!-- This is the document language code which uses internet standard RFC 4646. This often differs from patient language within recordTarget -->
	<languageCode code="en-US"/>
	<setId extension="sTT988" root="2.16.840.1.113883.19.5.99999.19"/>
	<!-- Version of this document -->
	<versionNumber value="1"/>
</ClinicalDocument>
`;

const EXAMPLE_XML = `
<note>
  <to>Tove</to>
  <from>Jani</from>
  <heading>Reminder</heading>
  <body>Don't forget me this weekend!</body>
</note>`;

describe('XmlDisplay', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    jest
      .spyOn(medplum, 'download')
      .mockImplementation(async (url: URL | string, _options: MedplumRequestOptions = {}): Promise<Blob> => {
        const urlString = url.toString();
        if (urlString.endsWith('note.xml')) {
          return {
            text: () => Promise.resolve(EXAMPLE_XML),
          } as unknown as Blob;
        }
        if (urlString.endsWith('ccda.xml')) {
          return {
            text: () => Promise.resolve(EXAMPLE_CCDA),
          } as unknown as Blob;
        }
        throw new Error('UNREACHABLE: Invalid url');
      });
  });

  function setup(url: string): void {
    render(<XmlDisplay url={url} />, ({ children }) => <MedplumProvider medplum={medplum}>{children}</MedplumProvider>);
  }

  test('Renders C-CDA with CcdaDisplay', async () => {
    setup('http://example.com/ccda.xml');
    expect(await screen.findByTestId('ccda-iframe')).toBeInTheDocument();
  });

  test('Renders other XML via IFrame', async () => {
    setup('http://example.com/note.xml');
    expect(await screen.findByTestId('xml-display-iframe')).toBeInTheDocument();
  });
});
