// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CoverageEligibilityRequest } from '@medplum/fhirtypes';
import { useSearchOne } from '@medplum/react';
import type { JSX } from 'react';
import { EligibilityDetails } from './EligibilityDetails';

export interface CoverageDetailPanelProps {
  request: CoverageEligibilityRequest;
}

export function CoverageDetailPanel({ request }: CoverageDetailPanelProps): JSX.Element {
  const [response, responseLoading] = useSearchOne('CoverageEligibilityResponse', {
    request: `CoverageEligibilityRequest/${request.id}`,
  });

  return <EligibilityDetails request={request} response={response} loadingResponse={responseLoading} />;
}
