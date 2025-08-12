// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button } from '@mantine/core';
import { JSX, useEffect, useRef, useState } from 'react';
import { exportJsonFile, sendCommand } from '../utils/dom';

const CCDA_VIEWER_URL = 'https://ccda.medplum.com';
const BASE_VALIDATION_URL = 'https://ccda-validator.medplum.com/';

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
    if (!url) {
      return;
    }

    try {
      setValidating(true);

      // Download the CCDA from the URL using plain fetch to avoid CORS issues
      const response = await fetch(url);
      const ccdaContent = await response.text();

      // Prepare form data for submission
      const formData = new FormData();
      formData.append('ccdaFile', new Blob([ccdaContent], { type: 'text/xml' }), 'ccda.xml');

      // Submit to validation API using direct fetch to avoid CORS issues
      const validationUrl = `${BASE_VALIDATION_URL}referenceccdaservice/?validationObjective=C-CDA_IG_Plus_Vocab&referenceFileName=No%20scenario%20File&curesUpdate=true&severityLevel=WARNING`;
      const validationResponse = await fetch(validationUrl, {
        method: 'POST',
        body: formData,
        // Don't send credentials for cross-origin requests
        credentials: 'omit',
        // Don't follow redirects automatically
        redirect: 'manual',
      });

      if (!validationResponse.ok) {
        throw new Error(`Validation failed: ${validationResponse.status} ${validationResponse.statusText}`);
      }

      // Parse the JSON response
      const validationResult = await validationResponse.json();
      setValidationResult(validationResult as ValidationResult);
    } catch (error) {
      setValidationResult(undefined);
      console.error('CCDA validation error:', error);
    } finally {
      setValidating(false);
    }
  };

  const downloadResults = (): void => {
    if (!validationResult) {
      return;
    }

    const resultsJson = JSON.stringify(validationResult, null, 2);
    exportJsonFile(resultsJson, 'ccda-validation-results');
  };

  const getErrorCount = (): number => {
    if (!validationResult) {
      return 0;
    }
    return validationResult.resultsMetaData.resultMetaData
      .filter((item) => item?.type.includes('Error'))
      .reduce((sum, item) => sum + (item.count || 0), 0);
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

      <div style={{ marginTop: '10px', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
        <Button type="button" onClick={validateCcda} disabled={validating}>
          {validating ? 'Validating...' : 'Validate'}
        </Button>

        {validationResult && (
          <>
            <div style={{ marginLeft: '15px' }}>
              <strong>Validation Results:</strong> {getErrorCount()} errors found
            </div>

            <Button
              type="button"
              onClick={downloadResults}
              color="green"
              style={{
                marginLeft: 'auto',
              }}
            >
              Download Full Results
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
