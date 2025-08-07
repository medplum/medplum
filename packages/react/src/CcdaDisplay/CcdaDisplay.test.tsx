// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import * as domUtils from '../utils/dom';
import { CcdaDisplay } from './CcdaDisplay';

const EXAMPLE_CCDA_URL = 'http://example.com/ccda';
const VALIDATION_URL_PATTERN = 'https://ccda-validator.medplum.com/referenceccdaservice/';

describe('CcdaDisplay', () => {
  let medplum: MockClient;
  let fetchSpy: jest.Mock;
  let exportJsonFileSpy: jest.SpyInstance;

  // Keep original fetch
  const originalFetch = global.fetch;

  beforeAll(() => {
    // Mock the exportJsonFile function
    exportJsonFileSpy = jest.spyOn(domUtils, 'exportJsonFile').mockImplementation(jest.fn());
  });

  beforeEach(() => {
    medplum = new MockClient();

    // Mock global fetch for both retrieving CCDA content and validation API
    fetchSpy = jest.fn().mockImplementation((url: string | URL, options?: RequestInit) => {
      const urlString = url.toString();

      // For CCDA content retrieval (GET request)
      if (urlString === EXAMPLE_CCDA_URL && (!options?.method || options.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('<ClinicalDocument>Example CCDA Content</ClinicalDocument>'),
        } as Response);
      }

      // For validation API (POST request)
      if (urlString.includes(VALIDATION_URL_PATTERN) && options?.method === 'POST') {
        const mockResponse = {
          resultsMetaData: {
            ccdaDocumentType: 'Care Plan',
            ccdaVersion: 'R2.1',
            objectiveProvided: 'C-CDA_IG_Plus_Vocab',
            serviceError: false,
            serviceErrorMessage: null,
            ccdaFileName: 'ccda.xml',
            ccdaFileContents: 'example content',
            resultMetaData: [
              {
                type: 'C-CDA MDHT Conformance Error',
                count: 5,
              },
              {
                type: 'C-CDA MDHT Conformance Warning',
                count: 3,
              },
              {
                type: 'ONC 2015 S&CC Reference C-CDA Validation Error',
                count: 4,
              },
            ],
            severityLevel: 'ERROR',
            totalConformanceErrorChecks: 4409,
          },
        };

        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockResponse),
        } as Response);
      }

      // Default case for unhandled URLs
      return Promise.reject(new Error(`Invalid URL or options in test: ${urlString}`));
    });

    global.fetch = fetchSpy as unknown as typeof global.fetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
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

  test('Does not open Iframe when no URL passed in', async () => {
    setup(undefined);
    expect(screen.queryByTestId('ccda-iframe')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
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
  });

  test('Validate button triggers validation process', async () => {
    setup(EXAMPLE_CCDA_URL);

    // Wait for the component to load
    expect(await screen.findByTestId('ccda-iframe')).toBeInTheDocument();

    // Validate button should be present
    const validateButton = screen.getByRole('button', { name: /Validate/i });
    expect(validateButton).toBeInTheDocument();

    // Click the validate button
    await act(async () => {
      fireEvent.click(validateButton);
    });

    // Should make fetch calls for both content and validation
    await waitFor(() => {
      // First call for CCDA content
      expect(fetchSpy).toHaveBeenCalledWith(EXAMPLE_CCDA_URL);

      // Second call for validation API
      const calls = fetchSpy.mock.calls;
      const validationCall = calls.find(
        (call) => call[0].toString().includes(VALIDATION_URL_PATTERN) && call[1]?.method === 'POST'
      );
      expect(validationCall).toBeTruthy();
      expect(validationCall[1].credentials).toBe('omit');
      expect(validationCall[1].body).toBeInstanceOf(FormData);
    });

    // Should display validation results with 9 errors (5 + 4)
    await waitFor(() => {
      expect(screen.getByText(/Validation Results:/)).toBeInTheDocument();
      expect(screen.getByText(/9 errors found/)).toBeInTheDocument();
    });

    // Download button should be visible
    expect(screen.getByRole('button', { name: /Download Full Results/i })).toBeInTheDocument();
  });

  test('Download button exports validation results as JSON', async () => {
    setup(EXAMPLE_CCDA_URL);

    // Wait for the component to load
    expect(await screen.findByTestId('ccda-iframe')).toBeInTheDocument();

    // Validate first
    const validateButton = screen.getByRole('button', { name: /Validate/i });
    await act(async () => {
      fireEvent.click(validateButton);
    });

    // Wait for validation results to appear
    await waitFor(() => {
      expect(screen.getByText(/Validation Results:/)).toBeInTheDocument();
    });

    // Find and click download button
    const downloadButton = screen.getByRole('button', { name: /Download Full Results/i });
    await act(async () => {
      fireEvent.click(downloadButton);
    });

    // Check that exportJsonFile was called with the validation results
    expect(exportJsonFileSpy).toHaveBeenCalledWith(expect.any(String), 'ccda-validation-results');
  });

  test('Validation with service error returns appropriate message', async () => {
    // Override fetch mock for this test to return a validation service error
    const originalFetchSpy = fetchSpy;
    fetchSpy = jest.fn().mockImplementation((url: string | URL, options?: RequestInit) => {
      const urlString = url.toString();

      // Still handle content retrieval normally
      if (urlString === EXAMPLE_CCDA_URL && (!options?.method || options.method === 'GET')) {
        return originalFetchSpy(url, options);
      }

      // For validation API, return service error
      if (urlString.includes(VALIDATION_URL_PATTERN) && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              resultsMetaData: {
                serviceError: true,
                serviceErrorMessage: 'Failed to validate CCDA document',
                resultMetaData: [], // Empty array of results
              },
            }),
        } as Response);
      }

      return Promise.reject(new Error(`Invalid URL or options in test: ${urlString}`));
    });

    global.fetch = fetchSpy as unknown as typeof global.fetch;

    setup(EXAMPLE_CCDA_URL);

    // Wait for the component to load
    expect(await screen.findByTestId('ccda-iframe')).toBeInTheDocument();

    // Click validate
    const validateButton = screen.getByRole('button', { name: /Validate/i });
    await act(async () => {
      fireEvent.click(validateButton);
    });

    // Should still display validation results with 0 errors
    await waitFor(() => {
      expect(screen.getByText(/Validation Results:/)).toBeInTheDocument();
      expect(screen.getByText(/0 errors found/)).toBeInTheDocument();
    });
  });

  test('Handles API validation failure correctly', async () => {
    // Mock console.error to check if error is logged
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Override fetch mock for this test to return a failed validation response
    const originalFetchSpy = fetchSpy;
    fetchSpy = jest.fn().mockImplementation((url: string | URL, options?: RequestInit) => {
      const urlString = url.toString();

      // Still handle content retrieval normally
      if (urlString === EXAMPLE_CCDA_URL && (!options?.method || options.method === 'GET')) {
        return originalFetchSpy(url, options);
      }

      // For validation API, return a server error response
      if (urlString.includes(VALIDATION_URL_PATTERN) && options?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        } as Response);
      }

      return Promise.reject(new Error(`Invalid URL or options in test: ${urlString}`));
    });

    global.fetch = fetchSpy as unknown as typeof global.fetch;

    setup(EXAMPLE_CCDA_URL);

    // Wait for the component to load
    expect(await screen.findByTestId('ccda-iframe')).toBeInTheDocument();

    // Click validate
    const validateButton = screen.getByRole('button', { name: /Validate/i });
    await act(async () => {
      fireEvent.click(validateButton);
    });

    // Wait for validation process to complete
    await waitFor(() => {
      // Verify the validation button is no longer in "validating" state
      expect(screen.getByRole('button', { name: /Validate/i })).toBeEnabled();
    });

    // Should not display any validation results
    expect(screen.queryByText(/Validation Results:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download Full Results/i })).not.toBeInTheDocument();

    // Should log the error
    expect(consoleErrorSpy).toHaveBeenCalledWith('CCDA validation error:', expect.any(Error));

    // Clean up
    consoleErrorSpy.mockRestore();
  });
});
