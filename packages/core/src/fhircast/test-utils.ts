import { FHIRCAST_CONTEXT_KEY_REVERSE_LOOKUP, FhircastEventContext, FhircastResourceType } from '.';
import { OperationOutcomeError, validationError } from '../outcomes';

export function createFhircastMessageContext(
  resourceType: FhircastResourceType,
  resourceId: string
): FhircastEventContext {
  if (!FHIRCAST_CONTEXT_KEY_REVERSE_LOOKUP[resourceType]) {
    throw new OperationOutcomeError(
      validationError(`resourceType must be one of: ${Object.keys(FHIRCAST_CONTEXT_KEY_REVERSE_LOOKUP).join(', ')}`)
    );
  }
  if (!(resourceId && typeof resourceId === 'string')) {
    throw new OperationOutcomeError(validationError('Must provide a resourceId.'));
  }
  return {
    key: FHIRCAST_CONTEXT_KEY_REVERSE_LOOKUP[resourceType],
    resource: {
      resourceType,
      id: resourceId,
    },
  };
}
