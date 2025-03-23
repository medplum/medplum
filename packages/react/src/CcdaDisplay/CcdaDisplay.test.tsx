import { ContentType, ReadablePromise } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import * as domUtils from '../utils/dom';
import { CcdaDisplay } from './CcdaDisplay';

const EXAMPLE_CCDA_URL = 'http://example.com/ccda';
const VALIDATION_URL =
  'https://ccda-validator.medplum.com/referenceccdaservice/?validationObjective=C-CDA_IG_Plus_Vocab&referenceFileName=No%20scenario%20File&curesUpdate=true&severityLevel=WARNING';

describe('CcdaDisplay', () => {
  let medplum: MockClient;
  let getSpy: jest.SpyInstance;
  let postSpy: jest.SpyInstance;
  let exportJsonFileSpy: jest.SpyInstance;

  beforeAll(() => {
    // Mock the exportJsonFile function
    exportJsonFileSpy = jest.spyOn(domUtils, 'exportJsonFile').mockImplementation(jest.fn());
  });

  beforeEach(() => {
    medplum = new MockClient();

    // Mock medplum.get for retrieving CCDA content
    getSpy = jest.spyOn(medplum, 'get').mockImplementation((url: string | URL) => {
      if (url === EXAMPLE_CCDA_URL) {
        return new ReadablePromise(Promise.resolve('<ClinicalDocument>Example CCDA Content</ClinicalDocument>'));
      }
      return new ReadablePromise(Promise.reject(new Error('Invalid route')));
    });

    // Mock medplum.post for validation API
    postSpy = jest.spyOn(medplum, 'post').mockImplementation((url: string | URL, body: any, contentType?: string) => {
      if (url.toString().includes('ccda-validator.medplum.com')) {
        expect(contentType).toBe(ContentType.MULTIPART_FORM_DATA);

        // Mock validation response matching the actual interface structure
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
        return new ReadablePromise(Promise.resolve(mockResponse));
      }
      return new ReadablePromise(Promise.reject(new Error('Invalid URL in test')));
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
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

    // Should get the CCDA content with medplum.get and submit to validation API via medplum.post
    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith(EXAMPLE_CCDA_URL);
      expect(postSpy).toHaveBeenCalledWith(
        expect.stringContaining('ccda-validator.medplum.com'),
        expect.any(FormData),
        ContentType.MULTIPART_FORM_DATA
      );
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
    // Override post mock for this test to return a service error
    postSpy.mockImplementationOnce((url: string | URL, body: any, contentType?: string) => {
      if (url.toString().includes('ccda-validator.medplum.com')) {
        expect(contentType).toBe(ContentType.MULTIPART_FORM_DATA);
        return new ReadablePromise(
          Promise.resolve({
            resultsMetaData: {
              serviceError: true,
              serviceErrorMessage: 'Failed to validate CCDA document',
              resultMetaData: [], // Empty array of results
            },
          })
        );
      }
      return new ReadablePromise(Promise.reject(new Error('Invalid URL in test')));
    });

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
});
