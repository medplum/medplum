// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Loader } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { CcdaViewer } from '../CcdaViewer/CcdaViewer';
import { exportJsonFile } from '../utils/dom';

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
  const [loaded, setLoaded] = useState<{ url: string; xml?: string; error?: string }>();
  const current = loaded?.url === url ? loaded : undefined;
  const xml = current?.xml;
  const loadError = current?.error;
  const [validationResult, setValidationResult] = useState<ValidationResult>();
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    if (!url) {
      return undefined;
    }
    let cancelled = false;
    // Plain fetch: the URL is a presigned Binary URL or a data: URI, so no auth header is needed
    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load C-CDA: ${response.status} ${response.statusText}`);
        }
        return response.text();
      })
      .then((text) => {
        if (!cancelled) {
          setLoaded({ url, xml: text });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoaded({ url, error: normalizeErrorString(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const validateCcda = async (): Promise<void> => {
    if (!xml) {
      return;
    }

    try {
      setValidating(true);

      // Prepare form data for submission
      const formData = new FormData();
      formData.append('ccdaFile', new Blob([xml], { type: 'text/xml' }), 'ccda.xml');

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
    <div data-testid="ccda-display" style={{ maxWidth: props.maxWidth }}>
      {loadError && (
        <Alert color="red" title="Unable to load C-CDA">
          {loadError}
        </Alert>
      )}
      {!loadError && (xml === undefined ? <Loader /> : <CcdaViewer xml={xml} />)}

      <div style={{ marginTop: '10px', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
        <Button type="button" onClick={validateCcda} disabled={validating || !xml}>
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
