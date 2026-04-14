// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CoverageEligibilityRequest, CoverageEligibilityResponse } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { EligibilityDetails } from './EligibilityDetails';

export interface CoverageDetailPanelProps {
  request: CoverageEligibilityRequest;
}

export function CoverageDetailPanel({ request }: CoverageDetailPanelProps): JSX.Element {
  const medplum = useMedplum();
  const [response, setResponse] = useState<CoverageEligibilityResponse>();
  const [responseLoading, setResponseLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const fetch = async (): Promise<void> => {
      setResponseLoading(true);
      setResponse(undefined);
      try {
        const results = await medplum.searchResources(
          'CoverageEligibilityResponse',
          new URLSearchParams({ request: `CoverageEligibilityRequest/${request.id}`, _count: '1' })
        );
        if (active) {
          setResponse(results[0]);
        }
      } catch (error) {
        if (active) {
          showErrorNotification(error);
        }
      } finally {
        if (active) {
          setResponseLoading(false);
        }
      }
    };
    fetch().catch(showErrorNotification);
    return () => {
      active = false;
    };
  }, [medplum, request.id]);

  return <EligibilityDetails request={request} response={response} loadingResponse={responseLoading} />;
}
