import {
  FhircastEventContext,
  FhircastEventContextKey,
  FhircastEventName,
  FhircastEventResource,
  FhircastEventResourceType,
  FhircastValidContextForEvent,
} from '.';
import { OperationOutcomeError, validationError } from '../outcomes';

export function createFhircastMessageContext<
  EventName extends FhircastEventName = FhircastEventName,
  K extends FhircastEventContextKey<EventName> = FhircastEventContextKey<EventName>,
>(
  key: K,
  resourceType: FhircastEventResourceType<EventName, K>,
  resourceId: string
): FhircastValidContextForEvent<EventName> {
  if (!(resourceId && typeof resourceId === 'string')) {
    throw new OperationOutcomeError(validationError('Must provide a resourceId.'));
  }
  return {
    key,
    resource: {
      resourceType,
      id: resourceId,
    } as FhircastEventResource<EventName, K>,
  } as FhircastEventContext<EventName, K>;
}
