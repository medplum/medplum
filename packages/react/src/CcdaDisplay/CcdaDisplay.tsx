// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button } from '@mantine/core';
import type { OperationOutcome, Parameters } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { exportJsonFile, sendCommand } from '../utils/dom';

const CCDA_VIEWER_URL = 'https://ccda.medplum.com';

export interface CcdaDisplayProps {
  readonly url?: string;
  readonly maxWidth?: number;
}

export function CcdaDisplay(props: CcdaDisplayProps): JSX.Element | null {
  const { url } = props;
  const medplum = useMedplum();
  const [shouldSend, setShouldSend] = useState(false);
  const iframeRef = useRef(null);
  const [validationResult, setValidationResult] = useState<OperationOutcome>();
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

      const params: Parameters = {
        resourceType: 'Parameters',
        parameter: [{ name: 'document', valueString: ccdaContent }],
      };
      setValidationResult(await medplum.post<OperationOutcome>(medplum.fhirUrl('$ccda-validate'), params));
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
    return validationResult.issue.filter((issue) => issue.severity === 'error' || issue.severity === 'fatal').length;
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
