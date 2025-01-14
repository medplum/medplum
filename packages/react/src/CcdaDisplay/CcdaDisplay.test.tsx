import { ReadablePromise } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen } from '../test-utils/render';
import * as domUtils from '../utils/dom';
import { CcdaDisplay } from './CcdaDisplay';

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

const EXAMPLE_CCDA_URL = 'http://example.com/ccda';

describe('XmlDisplay', () => {
  let medplum: MockClient;
  let getSpy: jest.SpyInstance;

  beforeAll(() => {});

  beforeEach(() => {
    medplum = new MockClient();
    getSpy = jest.spyOn(medplum, 'get').mockImplementation((url: string | URL, _options: any) => {
      return new ReadablePromise(
        new Promise((resolve, reject) => {
          if (url === EXAMPLE_CCDA_URL) {
            resolve(EXAMPLE_CCDA);
            return;
          }
          reject(new Error('Invalid route'));
        })
      );
    });
  });

  function setup(url: string | undefined): void {
    render(<CcdaDisplay url={url} />, ({ children }) => (
      <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
    ));
  }

  test('Does not open Iframe when no URL passed in', async () => {
    setup(undefined);
    expect(screen.queryByTestId('ccda-iframe')).not.toBeInTheDocument();
    expect(getSpy).not.toHaveBeenCalled();
  });

  test('Renders C-CDA', async () => {
    const sendCommandSpy = jest.spyOn(domUtils, 'sendCommand').mockImplementation(jest.fn(async () => {}));
    setup(EXAMPLE_CCDA);
    expect(await screen.findByTestId('ccda-iframe')).toBeInTheDocument();
    await act(async () => {
      fireEvent.load(screen.getByTitle('C-CDA Viewer'));
    });
    expect(sendCommandSpy).toHaveBeenCalledWith(expect.any(HTMLIFrameElement), {
      command: 'loadCcdaXml',
      value: EXAMPLE_CCDA,
    });
    expect(getSpy).not.toHaveBeenCalled();
  });
});
