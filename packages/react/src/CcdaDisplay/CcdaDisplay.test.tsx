import { ReadablePromise } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen } from '../test-utils/render';
import * as domUtils from '../utils/dom';
import { CcdaDisplay } from './CcdaDisplay';

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
            resolve('EXAMPLE_CCDA');
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
    setup(EXAMPLE_CCDA_URL);
    expect(await screen.findByTestId('ccda-iframe')).toBeInTheDocument();
    await act(async () => {
      fireEvent.load(screen.getByTitle('C-CDA Viewer'));
    });
    expect(sendCommandSpy).toHaveBeenCalledWith(expect.any(HTMLIFrameElement), {
      command: 'loadCcdaXml',
      value: EXAMPLE_CCDA_URL,
    });
    expect(getSpy).not.toHaveBeenCalled();
  });
});
