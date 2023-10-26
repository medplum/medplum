import {
  FHIRCAST_CONTEXT_KEY_REVERSE_LOOKUP,
  FhircastEventContext,
  FhircastEventContextKey,
  FhircastEventName,
  FhircastEventResource,
  FhircastEventResourceType,
} from '.';
import { OperationOutcomeError, validationError } from '../outcomes';

export function createFhircastMessageContext<
  EventName extends FhircastEventName = FhircastEventName,
  K extends FhircastEventContextKey<EventName> = FhircastEventContextKey<EventName>,
>(resourceType: FhircastEventResourceType<EventName, K>, resourceId: string): FhircastEventContext<EventName> {
  if (!FHIRCAST_CONTEXT_KEY_REVERSE_LOOKUP[resourceType]) {
    throw new OperationOutcomeError(
      validationError(`resourceType must be one of: ${Object.keys(FHIRCAST_CONTEXT_KEY_REVERSE_LOOKUP).join(', ')}`)
    );
  }
  if (!(resourceId && typeof resourceId === 'string')) {
    throw new OperationOutcomeError(validationError('Must provide a resourceId.'));
  }
  return {
    key: FHIRCAST_CONTEXT_KEY_REVERSE_LOOKUP[resourceType] as unknown as K,
    resource: {
      resourceType,
      id: resourceId,
    } as FhircastEventResource<EventName, K>,
  } as FhircastEventContext<EventName, K>;
}
