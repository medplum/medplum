import { allOk } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { getLogger } from '../../context';

export async function awsComprehendHandler(req: FhirRequest): Promise<FhirResponse> {
  getLogger().info('awsComprehendHandler', req.body);
  return [allOk];
}
