import { Resource } from '@medplum/fhirtypes';
import {
  FHIRCAST_EVENT_RESOURCES,
  FhircastEventContext,
  FhircastEventContextDetails,
  FhircastEventKeys,
  FhircastEventName,
} from '.';
import { badRequest, OperationOutcomeError, validationError } from '../outcomes';
import { isResource } from '../types';
import { createReference } from '../utils';

export function createFhircastMessageContext<
  EventName extends FhircastEventName = FhircastEventName,
  K extends FhircastEventKeys<EventName> = FhircastEventKeys<EventName>,
>(event: EventName, key: K, resource: Resource): FhircastEventContext<EventName> {
  if (!(isResource(resource) && resource.id)) {
    throw new OperationOutcomeError(validationError('Must provide a resource for the context.'));
  }
  const eventEntry = (FHIRCAST_EVENT_RESOURCES[event][key] as FhircastEventContextDetails) ?? {};
  if (!eventEntry) {
    throw new OperationOutcomeError(badRequest(`Key '${key.toString()}' does not exist for event '${event}'.`));
  }
  if (eventEntry.reference && eventEntry.array) {
    throw new OperationOutcomeError(badRequest('TODO: support for select context'));
  }
  if (eventEntry.reference) {
    return {
      key,
      reference: createReference(resource),
    } as FhircastEventContext<EventName>;
  }
  return {
    key,
    resource,
  } as FhircastEventContext<EventName>;
}
