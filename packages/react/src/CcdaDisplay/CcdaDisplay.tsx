import { useEffect, useRef, useState } from 'react';
import { sendCommand } from '../utils/dom';

const CCDA_VIEWER_URL = 'https://ccda.medplum.com';
const BASE_VALIDATION_URL = 'http://localhost:8080/';

export interface CcdaDisplayProps {
  readonly url?: string;
  readonly maxWidth?: number;
}

interface ValidationResult {
  resultsMetaData: {
    ccdaDocumentType: string;
    ccdaVersion: string;
    objectiveProvided: string;
    serviceError: boolean;
    serviceErrorMessage: string | null;
    ccdaFileName: string;
    ccdaFileContents: string;
    resultMetaData: {
      type: string;
      count: number;
    }[];
    severityLevel: string;
    totalConformanceErrorChecks: number;
  };
}

export function CcdaDisplay(props: CcdaDisplayProps): JSX.Element | null {
  const { url } = props;
  const [shouldSend, setShouldSend] = useState(false);
  const iframeRef = useRef(null);
  const [validationResult, setValidationResult] = useState<ValidationResult>();
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    if (!url) {
      return;
    }
    if (shouldSend && iframeRef.current) {
      sendCommand(iframeRef.current, { command: 'loadCcdaXml', value: url }).catch(console.error);
      setShouldSend(false);
    }
  }, [url, shouldSend]);

  const validateCcda = async (): Promise<void> => {
    if (!url) return;

    try {
      setValidating(true);

      // Download the CCDA from the URL
      const response = await fetch(url);
      const ccdaContent = await response.text();

      // Prepare form data for submission
      const formData = new FormData();
      formData.append('ccdaFile', new Blob([ccdaContent], { type: 'text/xml' }), 'ccda.xml');

      // Submit to validation API
      const validationResponse = await fetch(
        `${BASE_VALIDATION_URL}referenceccdaservice/?validationObjective=NegativeTesting_CarePlan&referenceFileName=No%20scenario%20File&curesUpdate=true&severityLevel=ERROR`,
        {
          method: 'POST',
          body: formData,
        }
      );

      if (!validationResponse.ok) {
        throw new Error(`Validation request failed: ${validationResponse.status}`);
      }

      const validationData = await validationResponse.json();
      console.log('Validation response:', validationData);
      setValidationResult(validationData);
    } catch (error) {
      console.error('CCDA validation error:', error);
    } finally {
      setValidating(false);
    }
  };

  const downloadResults = (): void => {
    if (!validationResult) return;

    const resultsJson = JSON.stringify(validationResult, null, 2);
    const blob = new Blob([resultsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // TODO: Use the exportJsonFile function from utils.ts in app
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ccda-validation-results.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getErrorCount = (): number => {
    if (!validationResult) return 0;

    // Check for resultMetaData array (where error counts are stored)
    if (Array.isArray(validationResult.resultsMetaData?.resultMetaData)) {
      return validationResult.resultsMetaData.resultMetaData
        .filter((item) => item.type && item.type.includes('Error'))
        .reduce((sum, item) => sum + (item.count || 0), 0);
    }

    console.log('Could not find expected error data structure in validation result', validationResult);

    return 0;
  };

  if (!url) {
    return null;
  }

  return (
    <div data-testid="ccda-iframe" style={{ maxWidth: props.maxWidth }}>
      <div style={{ minHeight: 400 }}>
        <iframe
          title="C-CDA Viewer"
          width="100%"
          height="400"
          ref={iframeRef}
          src={CCDA_VIEWER_URL}
          allowFullScreen={true}
          frameBorder={0}
          seamless={true}
          onLoad={() => setShouldSend(true)}
        />
      </div>

      <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center' }}>
        <button
          onClick={validateCcda}
          disabled={validating}
          style={{
            padding: '8px 16px',
            backgroundColor: '#0066cc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: validating ? 'not-allowed' : 'pointer',
          }}
        >
          {validating ? 'Validating...' : 'Validate'}
        </button>

        {validationResult && (
          <>
            <div style={{ marginLeft: '15px' }}>
              <strong>Validation Results:</strong> {getErrorCount()} errors found
            </div>

            <button
              onClick={downloadResults}
              style={{
                marginLeft: 'auto',
                padding: '8px 16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Download Full Results
            </button>
          </>
        )}
      </div>
    </div>
  );
}
