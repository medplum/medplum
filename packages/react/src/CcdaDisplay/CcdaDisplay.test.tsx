// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { OperationOutcome } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { Mock, MockInstance } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import * as domUtils from '../utils/dom';
import { CcdaDisplay } from './CcdaDisplay';

const EXAMPLE_CCDA_URL = 'http://example.com/ccda';
const EXAMPLE_CCDA = '<ClinicalDocument>Example CCDA Content</ClinicalDocument>';

const VALIDATION_RESULT: OperationOutcome = {
  resourceType: 'OperationOutcome',
  issue: [
    { severity: 'error', code: 'structure', details: { text: 'Missing required property' } },
    { severity: 'error', code: 'structure', details: { text: 'Invalid dateTime format' } },
    { severity: 'warning', code: 'structure', details: { text: 'Warning' } },
  ],
};

describe('CcdaDisplay', () => {
  let medplum: MockClient;
  let fetchSpy: Mock;
  let postSpy: MockInstance;
  let exportJsonFileSpy: MockInstance;

  // Keep original fetch
  const originalFetch = global.fetch;

  beforeAll(() => {
    // Mock the exportJsonFile function
    exportJsonFileSpy = vi.spyOn(domUtils, 'exportJsonFile').mockImplementation(vi.fn());
  });

  beforeEach(() => {
    medplum = new MockClient();
    postSpy = vi.spyOn(medplum, 'post').mockResolvedValue(VALIDATION_RESULT);

    // Mock global fetch for retrieving CCDA content
    fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(EXAMPLE_CCDA) });
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });

  function setup(url: string | undefined): void {
    render(<CcdaDisplay url={url} />, ({ children }) => (
      <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
    ));
  }

  async function clickValidate(): Promise<void> {
    expect(await screen.findByTestId('ccda-iframe')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Validate/i }));
    });
  }

  test('Does not open Iframe when no URL passed in', async () => {
    setup(undefined);
    expect(screen.queryByTestId('ccda-iframe')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('Renders C-CDA', async () => {
    const sendCommandSpy = vi.spyOn(domUtils, 'sendCommand').mockImplementation(vi.fn(async () => {}));
    setup(EXAMPLE_CCDA_URL);
    expect(await screen.findByTestId('ccda-iframe')).toBeInTheDocument();
    await act(async () => {
      fireEvent.load(screen.getByTitle('C-CDA Viewer'));
    });
    expect(sendCommandSpy).toHaveBeenCalledWith(expect.any(HTMLIFrameElement), {
      command: 'loadCcdaXml',
      value: EXAMPLE_CCDA_URL,
    });
  });

  test('Validate button sends the C-CDA to $ccda-validate', async () => {
    setup(EXAMPLE_CCDA_URL);
    await clickValidate();

    expect(fetchSpy).toHaveBeenCalledWith(EXAMPLE_CCDA_URL);
    expect(postSpy).toHaveBeenCalledWith(medplum.fhirUrl('$ccda-validate'), {
      resourceType: 'Parameters',
      parameter: [{ name: 'document', valueString: EXAMPLE_CCDA }],
    });

    // Warnings are not counted as errors
    await waitFor(() => {
      expect(screen.getByText(/Validation Results:/)).toBeInTheDocument();
      expect(screen.getByText(/2 errors found/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Download Full Results/i })).toBeInTheDocument();
  });

  test('Download button exports validation results as JSON', async () => {
    setup(EXAMPLE_CCDA_URL);
    await clickValidate();

    await waitFor(() => {
      expect(screen.getByText(/Validation Results:/)).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Download Full Results/i }));
    });

    expect(exportJsonFileSpy).toHaveBeenCalledWith(
      JSON.stringify(VALIDATION_RESULT, null, 2),
      'ccda-validation-results'
    );
  });

  test('Handles API validation failure correctly', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    postSpy.mockRejectedValue(new Error('Internal Server Error'));

    setup(EXAMPLE_CCDA_URL);
    await clickValidate();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Validate/i })).toBeEnabled();
    });
    expect(screen.queryByText(/Validation Results:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download Full Results/i })).not.toBeInTheDocument();
    expect(consoleErrorSpy).toHaveBeenCalledWith('CCDA validation error:', expect.any(Error));

    consoleErrorSpy.mockRestore();
  });
});
