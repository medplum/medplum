// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  Bundle,
  DiagnosticReport,
  Encounter,
  ImagingStudy,
  OperationOutcome,
  Patient,
  Reference,
  Resource,
} from '@medplum/fhirtypes';
import { generateId } from '../crypto';
import { TypedEventTarget } from '../eventtarget';
import { OperationOutcomeError, validationError } from '../outcomes';
import { isReference, isResource } from '../types';
import type {
  IReconnectingWebSocket,
  IReconnectingWebSocketCtor,
  Options as ReconnectingWebSocketOptions,
} from '../websockets/reconnecting-websocket';
import { ReconnectingWebSocket } from '../websockets/reconnecting-websocket';

// We currently try to satisfy both STU2 and STU3. Where STU3 removes a resource / key from STU2, we leave it in as a valid key but don't require it.

export const FHIRCAST_EVENT_NAMES = {
  'Patient-open': 'Patient-open',
  'Patient-close': 'Patient-close',
  'ImagingStudy-open': 'ImagingStudy-open',
  'ImagingStudy-close': 'ImagingStudy-close',
  'Encounter-open': 'Encounter-open',
  'Encounter-close': 'Encounter-close',
  'DiagnosticReport-open': 'DiagnosticReport-open',
  'DiagnosticReport-close': 'DiagnosticReport-close',
  'DiagnosticReport-select': 'DiagnosticReport-select',
  'DiagnosticReport-update': 'DiagnosticReport-update',
  syncerror: 'syncerror',
} as const;

export const FHIRCAST_RESOURCE_TYPES = [
  'Patient',
  'Encounter',
  'ImagingStudy',
  'DiagnosticReport',
  'OperationOutcome',
  'Bundle',
] as const;

export const FHIRCAST_EVENT_VERSION_REQUIRED = ['DiagnosticReport-update'] as const;
export type FhircastEventVersionRequired = (typeof FHIRCAST_EVENT_VERSION_REQUIRED)[number];
export type FhircastEventVersionOptional = Exclude<FhircastEventName, FhircastEventVersionRequired>;
export function isContextVersionRequired(event: string): event is FhircastEventVersionRequired {
  return (FHIRCAST_EVENT_VERSION_REQUIRED as readonly string[]).includes(event);
}
export function assertContextVersionOptional(event: string): asserts event is FhircastEventVersionOptional {
  if ((FHIRCAST_EVENT_VERSION_REQUIRED as readonly string[]).includes(event)) {
    throw new OperationOutcomeError(validationError(`'context.version' is required for '${event}'.`));
  }
}

export type FhircastEventName = keyof typeof FHIRCAST_EVENT_NAMES;
export type FhircastResourceEventName = Exclude<FhircastEventName, 'syncerror'>;
export type FhircastResourceType = (typeof FHIRCAST_RESOURCE_TYPES)[number];
export type FhircastAnchorResourceType = 'Patient' | 'ImagingStudy' | 'Encounter' | 'DiagnosticReport';

export type FhircastEventContextDetails = {
  resourceType: FhircastResourceType | '*';
  optional?: boolean; // NOTE: optional here is only referring to the schema, the spec often mentions that these are required if available as references for a given anchor resource
  manyAllowed?: boolean;
  array?: boolean;
  reference?: boolean;
};

// Key value pairs of { [FhircastEventName]: [required_resource1, required_resource2] }
export const FHIRCAST_EVENT_RESOURCES = {
  'Patient-open': {
    patient: { resourceType: 'Patient' },
    /* STU2 only! `encounter` key removed in STU3 */
    encounter: { resourceType: 'Encounter', optional: true },
  },
  'Patient-close': {
    patient: { resourceType: 'Patient' },
    /* STU2 only! `encounter` key removed in STU3 */
    encounter: { resourceType: 'Encounter', optional: true },
  },
  'ImagingStudy-open': {
    study: { resourceType: 'ImagingStudy' },
    encounter: { resourceType: 'Encounter', optional: true },
    patient: { resourceType: 'Patient', optional: true },
  },
  'ImagingStudy-close': {
    study: { resourceType: 'ImagingStudy' },
    encounter: { resourceType: 'Encounter', optional: true },
    patient: { resourceType: 'Patient', optional: true },
  },
  'Encounter-open': {
    encounter: { resourceType: 'Encounter' },
    patient: { resourceType: 'Patient' },
  },
  'Encounter-close': {
    encounter: { resourceType: 'Encounter' },
    patient: { resourceType: 'Patient' },
  },
  'DiagnosticReport-open': {
    report: { resourceType: 'DiagnosticReport' },
    encounter: { resourceType: 'Encounter', optional: true },
    study: { resourceType: 'ImagingStudy', optional: true, manyAllowed: true },
    patient: { resourceType: 'Patient' },
  },
  'DiagnosticReport-close': {
    report: { resourceType: 'DiagnosticReport' },
    encounter: { resourceType: 'Encounter', optional: true },
    study: { resourceType: 'ImagingStudy', optional: true, manyAllowed: true },
    patient: { resourceType: 'Patient' },
  },
  'DiagnosticReport-select': {
    // Most event contexts contain a full resource, but `DiagnosticReport-select` context elements are actually references
    // See: https://build.fhir.org/ig/HL7/fhircast-docs/3-6-4-DiagnosticReport-select.html
    report: { resourceType: 'DiagnosticReport', reference: true },
    patient: { resourceType: 'Patient', optional: true, reference: true },
    select: { resourceType: '*', reference: true, manyAllowed: true },
  },
  'DiagnosticReport-update': {
    // `report` and `patient` are also references for `DiagnosticReport-update`:
    // See: https://build.fhir.org/ig/HL7/fhircast-docs/3-6-3-DiagnosticReport-update.html
    report: { resourceType: 'DiagnosticReport', reference: true },
    patient: { resourceType: 'Patient', optional: true, reference: true },
    updates: { resourceType: 'Bundle' },
  },
  syncerror: {
    operationoutcome: { resourceType: 'OperationOutcome' },
  },
} as const satisfies Record<FhircastEventName, Record<string, FhircastEventContextDetails>>;

/**
 * Checks if a `ResourceType` can be used in a `FHIRcast` context.
 *
 * @param resourceType - A `ResourceType` to test.
 * @returns `true` if this is a resource type associated with `FHIRcast` contexts, otherwise returns `false`.
 */
export function isFhircastResourceType(resourceType: FhircastResourceType): boolean {
  return FHIRCAST_RESOURCE_TYPES.includes(resourceType);
}

/**
 * A `FHIRcast` subscription request.
 *
 * Can be passed to `MedplumClient.fhircastConnect` or `MedplumClient.fhircastUnsubscribe` to either open a `FHIRcast` connection, or unsubscribe from the subscription.
 */
export type SubscriptionRequest = {
  channelType: 'websocket';
  mode: 'subscribe' | 'unsubscribe';
  events: FhircastEventName[];
  topic: string;
  endpoint: string;
};

export type FhircastPatientContext = { key: 'patient'; resource: Patient };
export type FhircastEncounterContext = { key: 'encounter'; resource: Encounter };
export type FhircastStudyContext = { key: 'study'; resource: ImagingStudy };
export type FhircastReportContext = { key: 'report'; resource: DiagnosticReport };
export type FhircastReportReferenceContext = { key: 'report'; reference: Reference<DiagnosticReport> };
export type FhircastPatientReferenceContext = { key: 'patient'; reference: Reference<Patient> };
export type FhircastUpdatesContext = { key: 'updates'; resource: Bundle };
export type FhircastSelectContext = { key: 'select'; reference: Reference };
export type FhircastOperationOutcomeContext = { key: 'operationoutcome'; resource: OperationOutcome };

// These are all the contexts that contain a `resource` key
export type FhircastResourceContext =
  | FhircastPatientContext
  | FhircastEncounterContext
  | FhircastStudyContext
  | FhircastReportContext
  | FhircastUpdatesContext
  | FhircastOperationOutcomeContext;

// The reference contexts related to `*-select` and `*-update` events, which contain a `reference` key
export type FhircastReferenceContext =
  FhircastReportReferenceContext | FhircastPatientReferenceContext | FhircastSelectContext;

export type FhircastPatientOpenContext = FhircastPatientContext | FhircastEncounterContext;
export type FhircastPatientCloseContext = FhircastPatientOpenContext;
export type FhircastImagingStudyOpenContext = FhircastStudyContext | FhircastEncounterContext | FhircastPatientContext;
export type FhircastImagingStudyCloseContext = FhircastImagingStudyOpenContext;
export type FhircastEncounterOpenContext = FhircastEncounterContext | FhircastPatientContext;
export type FhircastEncounterCloseContext = FhircastEncounterOpenContext;
export type FhircastDiagnosticReportOpenContext =
  FhircastReportContext | FhircastEncounterContext | FhircastStudyContext | FhircastPatientContext;
export type FhircastDiagnosticReportCloseContext = FhircastDiagnosticReportOpenContext;
export type FhircastDiagnosticReportUpdateContext =
  FhircastReportReferenceContext | FhircastPatientReferenceContext | FhircastUpdatesContext;
export type FhircastDiagnosticReportSelectContext =
  FhircastReportReferenceContext | FhircastPatientReferenceContext | FhircastSelectContext;
export type FhircastSyncErrorContext = FhircastOperationOutcomeContext;

// This is the one key that only exists within a GetCurrentContext
// Specifically related to the `DiagnosticReport-update` event in a `DiagnosticReport` context
// See the FHIRcast docs regarding content sharing: https://build.fhir.org/ig/HL7/fhircast-docs/2-10-ContentSharing.html#updating-attributes-of-context-resources-and-addingremoving-context-resources
// And the GetCurrentContext page that mentions the specifications of this key: https://build.fhir.org/ig/HL7/fhircast-docs/2-9-GetCurrentContext.html#context
export type FhircastHubContentContext = {
  key: 'content';
  resource: Bundle;
};

// Type utility to get keys for a specific event
export type FhircastEventKeys<EventName extends FhircastEventName> = keyof (typeof FHIRCAST_EVENT_RESOURCES)[EventName];

// Type utility to extract the resource type from an event and key
export type FhircastContextResourceType<
  EventName extends FhircastEventName,
  K extends FhircastEventKeys<EventName>,
> = (typeof FHIRCAST_EVENT_RESOURCES)[EventName][K] extends { resourceType: infer R } ? R : never;

export type FhircastEventContext<EventName extends FhircastEventName = FhircastResourceEventName> =
  EventName extends 'Patient-open'
    ? FhircastPatientOpenContext
    : EventName extends 'Patient-close'
      ? FhircastPatientCloseContext
      : EventName extends 'ImagingStudy-open'
        ? FhircastImagingStudyOpenContext
        : EventName extends 'ImagingStudy-close'
          ? FhircastImagingStudyCloseContext
          : EventName extends 'Encounter-open'
            ? FhircastEncounterOpenContext
            : EventName extends 'Encounter-close'
              ? FhircastEncounterCloseContext
              : EventName extends 'DiagnosticReport-open'
                ? FhircastDiagnosticReportOpenContext
                : EventName extends 'DiagnosticReport-close'
                  ? FhircastDiagnosticReportCloseContext
                  : EventName extends 'DiagnosticReport-update'
                    ? FhircastDiagnosticReportUpdateContext
                    : EventName extends 'DiagnosticReport-select'
                      ? FhircastDiagnosticReportSelectContext
                      : EventName extends 'syncerror'
                        ? FhircastSyncErrorContext
                        : never;

export type AnchorResourceOpenEvent<T extends FhircastAnchorResourceType> = T extends FhircastAnchorResourceType
  ? `${T}-open`
  : never;

export type CurrentContext<T extends FhircastAnchorResourceType | '' = FhircastAnchorResourceType | ''> = T extends ''
  ? { 'context.type': ''; context: never[] }
  : T extends 'DiagnosticReport'
    ? {
        'context.type': 'DiagnosticReport';
        'context.versionId': string;
        context: (FhircastEventContext<'DiagnosticReport-open'> | FhircastHubContentContext)[];
      }
    : T extends 'Patient' | 'Encounter' | 'ImagingStudy'
      ? {
          'context.type': T;
          'context.versionId': string;
          context: FhircastEventContext<AnchorResourceOpenEvent<T>>[];
        }
      : never;

export type PendingSubscriptionRequest = Omit<SubscriptionRequest, 'endpoint'>;

export type FhircastEventPayload<EventName extends FhircastEventName = FhircastEventName> = {
  'hub.topic': string;
  'hub.event': EventName;
  context: FhircastEventContext<EventName>[];
  'context.versionId'?: string;
  'context.priorVersionId'?: string;
};

export type FhircastMessagePayload<EventName extends FhircastEventName = FhircastEventName> = {
  timestamp: string;
  id: string;
  event: FhircastEventPayload<EventName>;
};

export function isCompletedSubscriptionRequest(
  subscriptionRequest: SubscriptionRequest | PendingSubscriptionRequest
): subscriptionRequest is SubscriptionRequest {
  return !!(subscriptionRequest as SubscriptionRequest).endpoint;
}

/**
 * Creates a serialized url-encoded payload for a `FHIRcast` subscription from a `SubscriptionRequest` object that can be directly used in an HTTP request to the Hub.
 *
 * @param subscriptionRequest - An object representing a subscription request.
 * @returns A serialized subscription in url-encoded form.
 */
export function serializeFhircastSubscriptionRequest(
  subscriptionRequest: SubscriptionRequest | PendingSubscriptionRequest
): string {
  if (!validateFhircastSubscriptionRequest(subscriptionRequest)) {
    throw new OperationOutcomeError(
      validationError('subscriptionRequest must be an object conforming to SubscriptionRequest type.')
    );
  }

  const { channelType, mode, topic, events } = subscriptionRequest;

  const formattedSubRequest = {
    'hub.channel.type': channelType,
    'hub.mode': mode,
    'hub.topic': topic,
  } as Record<string, string>;

  if (mode === 'subscribe') {
    // An unsubscribe cancels an endpoint, and the Hub already holds the events it was issued for
    formattedSubRequest['hub.events'] = events.join(',');
  }

  if (isCompletedSubscriptionRequest(subscriptionRequest)) {
    // Named for the field the Hub issued the endpoint under, which is what identifies the
    // subscription being cancelled back to it
    formattedSubRequest['hub.channel.endpoint'] = subscriptionRequest.endpoint;
  }
  return new URLSearchParams(formattedSubRequest).toString();
}

/**
 * Validates that a `SubscriptionRequest`.
 *
 * @param subscriptionRequest - The `SubscriptionRequest` to validate.
 * @returns A `boolean` indicating whether or not the `SubscriptionRequest` is valid.
 */
export function validateFhircastSubscriptionRequest(
  subscriptionRequest: SubscriptionRequest | PendingSubscriptionRequest
): boolean {
  if (typeof subscriptionRequest !== 'object') {
    return false;
  }
  const { channelType, mode, topic, events } = subscriptionRequest;
  if (!(channelType && mode && topic && events)) {
    return false;
  }
  if (typeof topic !== 'string') {
    return false;
  }
  if (typeof events !== 'object' || !Array.isArray(events) || events.length < 1) {
    return false;
  }
  if (channelType !== 'websocket') {
    return false;
  }
  if (mode !== 'subscribe' && mode !== 'unsubscribe') {
    return false;
  }
  for (const event of events) {
    if (!FHIRCAST_EVENT_NAMES[event]) {
      return false;
    }
  }
  if (
    isCompletedSubscriptionRequest(subscriptionRequest) &&
    !(typeof subscriptionRequest.endpoint === 'string' && subscriptionRequest.endpoint.startsWith('ws'))
  ) {
    return false;
  }
  return true;
}

/**
 * Throws if the context resource type is invalid. Intended as a helper for `validateFhircastContexts` only.
 *
 * @param event - The `FHIRcast` event name associated with the provided contexts.
 * @param resource - The `FHIRcast` event context resource to validate for given key.
 * @param i - The index of the current context in the context list.
 * @param keySchema - Schema for given key for FHIRcast event.
 */
function validateSingleResourceContext(
  event: FhircastEventName,
  resource: Resource,
  i: number,
  keySchema: FhircastEventContextDetails
): void {
  if (typeof resource !== 'object') {
    throw new OperationOutcomeError(
      validationError(
        `context[${i}] is invalid. Context must contain a single valid FHIR resource! Resource is not an object.`
      )
    );
  }
  if (!(resource.id && typeof resource.id === 'string')) {
    throw new OperationOutcomeError(
      validationError(`context[${i}] is invalid. Resource must contain a valid string ID.`)
    );
  }
  if (!resource.resourceType) {
    throw new OperationOutcomeError(
      validationError(`context[${i}] is invalid. Resource must contain a resource type. No resource type found.`)
    );
  }
  const expectedResourceType = keySchema.resourceType;
  // Make sure that resource is a valid type for this event if expected is not wildcard
  if (expectedResourceType !== '*') {
    if (!isFhircastResourceType(resource.resourceType as FhircastResourceType)) {
      throw new OperationOutcomeError(
        validationError(
          `context[${i}] is invalid. Resource must contain a valid FHIRcast resource type. Resource type is not a known resource type.`
        )
      );
    }
    if (expectedResourceType && resource.resourceType !== expectedResourceType) {
      throw new OperationOutcomeError(
        validationError(
          `context[${i}] is invalid. context[${i}] for the '${event}' event should contain resource of type ${expectedResourceType}.`
        )
      );
    }
  }
}

/**
 * Throws if the context is invalid. Intended as a helper for `validateFhircastContexts` only.
 *
 * @param event - The `FHIRcast` event name associated with the provided contexts.
 * @param context - The `FHIRcast` event contexts to validate.
 * @param i - The index of the current context in the context list.
 * @param keySchema - Schema for given key for FHIRcast event.
 * @param keysSeen - Set of keys seen so far. Used to prevent duplicate keys.
 */
function validateFhircastContext<EventName extends FhircastEventName = FhircastEventName>(
  event: EventName,
  context: FhircastEventContext<EventName>,
  i: number,
  keySchema: FhircastEventContextDetails,
  keysSeen: Map<FhircastEventContext<EventName>['key'], number>
): void {
  keysSeen.set(context.key, (keysSeen.get(context.key) ?? 0) + 1);

  if (keySchema.reference) {
    if (!isReference((context as FhircastReferenceContext).reference)) {
      // Validate single reference
      throw new OperationOutcomeError(
        validationError(`context[${i}] is invalid. Expected key '${context.key}' to be a reference.`)
      );
    }
  } else {
    validateSingleResourceContext(event, (context as FhircastResourceContext).resource, i, keySchema);
  }
}

/**
 * Throws if any context in the given array of contexts is invalid.
 *
 * @param event - The `FHIRcast` event name associated with the provided contexts.
 * @param contexts - The `FHIRcast` event contexts to validate.
 */
function validateFhircastContexts<EventName extends FhircastEventName>(
  event: EventName,
  contexts: FhircastEventContext<EventName>[]
): void {
  const keysSeen = new Map<FhircastEventContext['key'], number>();
  const eventSchema = FHIRCAST_EVENT_RESOURCES[event] as Record<
    FhircastEventContext['key'],
    FhircastEventContextDetails
  >;
  for (let i = 0; i < contexts.length; i++) {
    const key = contexts[i].key as FhircastEventContext['key'];
    if (!eventSchema[key]) {
      throw new OperationOutcomeError(
        validationError(`Key '${key}' not found for event '${event}'. Make sure to add only valid keys.`)
      );
    }
    validateFhircastContext(event, contexts[i], i, eventSchema[key], keysSeen);
  }
  // Iterate each key, if conditions for keys are not met as confirmed by `keysSeen` map, throw an error
  for (const [key, details] of Object.entries(eventSchema) as [
    FhircastEventContext['key'],
    FhircastEventContextDetails,
  ][]) {
    // If not optional and not keysSeen.has(key), throw
    if (!(details.optional || keysSeen.has(key))) {
      throw new OperationOutcomeError(
        validationError(`Missing required key '${key}' on context for '${event}' event.`)
      );
    }
    // If not multiple allowed and keySeen.get(key) > 1, throw
    if (!details.manyAllowed && (keysSeen.get(key) ?? 0) > 1) {
      throw new OperationOutcomeError(
        validationError(
          `${keysSeen.get(
            key
          )} context entries with key '${key}' found for the '${event}' event when schema only allows for 1.`
        )
      );
    }
  }
}

/**
 * Creates a serializable JSON payload for the `FHIRcast` protocol
 *
 * @param topic - The topic that this message will be published on. Usually a UUID.
 * @param event - The event name, ie. "Patient-open" or "Patient-close".
 * @param context - The updated context, containing new versions of resources related to this event.
 * @param versionId - The current `versionId` of the anchor context. For example, in `DiagnosticReport-update`, it's the `versionId` of the `DiagnosticReport`.
 * @returns A serializable `FhircastMessagePayload`.
 */
export function createFhircastMessagePayload<
  EventName extends FhircastEventVersionOptional | FhircastEventVersionRequired,
>(
  topic: string,
  event: EventName,
  context: FhircastEventContext<EventName> | FhircastEventContext<EventName>[],
  versionId?: string
): FhircastMessagePayload<EventName> {
  if (!(topic && typeof topic === 'string')) {
    throw new OperationOutcomeError(validationError('Must provide a topic.'));
  }
  if (!FHIRCAST_EVENT_NAMES[event]) {
    throw new OperationOutcomeError(
      validationError(
        `Must provide a valid FHIRcast event name. Supported events: ${Object.keys(FHIRCAST_EVENT_NAMES).join(', ')}`
      )
    );
  }
  if (typeof context !== 'object') {
    throw new OperationOutcomeError(validationError('context must be a context object or array of context objects.'));
  }
  if ((FHIRCAST_EVENT_VERSION_REQUIRED as readonly string[]).includes(event) && !versionId) {
    throw new OperationOutcomeError(validationError(`The '${event}' event must contain a 'context.versionId'.`));
  }
  const normalizedContexts = Array.isArray(context) ? context : [context];
  // This will throw if any context in the array is invalid
  validateFhircastContexts(event, normalizedContexts);
  return {
    timestamp: new Date().toISOString(),
    id: generateId(),
    event: {
      'hub.topic': topic,
      'hub.event': event,
      context: normalizedContexts,
      ...(versionId ? { 'context.versionId': versionId } : {}),
    },
  };
}

/*
 * Derived events
 *
 * A context change carries every resource the anchor event needs, and the spec guarantees those
 * resources are named the same way in any event derivable from it:
 *
 * > In the case in which other events are derivable from the event in question, additional
 * > non-anchor FHIR resources included in the event SHALL be named what they are named in the
 * > derivable event.
 * > Source: https://build.fhir.org/ig/HL7/fhircast-docs/2-3-Events.html
 *
 * So a `DiagnosticReport-open` carrying `patient`, `encounter` and `study` contexts already holds
 * everything a `Patient-open`, an `Encounter-open` and an `ImagingStudy-open` would carry, and the
 * Hub can synthesize them for the subscribers that asked for those events instead.
 */

/** The anchor resource types that take part in derivation, ordered least to most specific. */
export const FHIRCAST_ANCHOR_SPECIFICITY = ['Patient', 'Encounter', 'ImagingStudy', 'DiagnosticReport'] as const;

/** The anchor types that can be *derived*. Nothing is less specific than `Patient`, so `DiagnosticReport` is never a target. */
export type FhircastDerivedAnchorResourceType = 'Patient' | 'Encounter' | 'ImagingStudy';

/** The `-open`/`-close` events derivation can synthesize. */
export type FhircastDerivedEventName = `${FhircastDerivedAnchorResourceType}-${'open' | 'close'}`;

type FhircastContextKey = FhircastResourceContext['key'];

/** The resource type each context key must hold for derivation to treat it as usable. */
const FHIRCAST_DERIVED_CONTEXT_RESOURCE_TYPES = {
  patient: 'Patient',
  encounter: 'Encounter',
  study: 'ImagingStudy',
  report: 'DiagnosticReport',
} as const satisfies Partial<Record<FhircastContextKey, FhircastResourceType>>;

type FhircastDerivedContextKey = keyof typeof FHIRCAST_DERIVED_CONTEXT_RESOURCE_TYPES;

type FhircastDerivedEventRule = {
  /** Keys without which the event cannot be synthesized at all. */
  required: readonly FhircastDerivedContextKey[];
  /**
   * Keys copied onto the derived event when the source carries them.
   *
   * Hand-written rather than read off the `optional` flags in `FHIRCAST_EVENT_RESOURCES`, which
   * describes the *union* of STU2 and STU3: `encounter` on `Patient-open` is STU2-only and was
   * removed in STU3. At publish time the Hub does not know which version a subscriber speaks, so
   * `Patient-open` is derived without it. Nothing is lost — a source carrying an `encounter` also
   * derives `Encounter-open`, which owns that key in both versions.
   */
  optional: readonly FhircastDerivedContextKey[];
  /** When set, one derived event is emitted per distinct resource under this key. */
  fanOutKey?: FhircastDerivedContextKey;
};

const FHIRCAST_DERIVED_EVENT_RULES = {
  Patient: { required: ['patient'], optional: [] },
  Encounter: { required: ['encounter', 'patient'], optional: [] },
  // `ImagingStudy-open` allows exactly one `study`, but a `DiagnosticReport-open` may carry many,
  // so each study becomes its own event rather than being dropped or crammed into one.
  ImagingStudy: { required: ['study'], optional: ['encounter', 'patient'], fanOutKey: 'study' },
} as const satisfies Record<FhircastDerivedAnchorResourceType, FhircastDerivedEventRule>;

/**
 * The events derivation knows how to derive *from*, keyed by lowercased name.
 *
 * Lookups against this map are what keep derivation total: `Home-open`, `userlogout`,
 * `DiagnosticReport-select`, `DiagnosticReport-update`, `syncerror` and anything unrecognized are
 * simply absent, and derive nothing. Every publish flows through here, so an event name must never
 * be parsed by splitting on `-`.
 */
const FHIRCAST_DERIVABLE_SOURCES: Record<string, { anchorIndex: number; suffix: 'open' | 'close' }> =
  Object.fromEntries(
    FHIRCAST_ANCHOR_SPECIFICITY.flatMap((anchor, anchorIndex) =>
      (['open', 'close'] as const).map((suffix) => [`${anchor}-${suffix}`.toLowerCase(), { anchorIndex, suffix }])
    )
  );

/**
 * Groups the usable resource contexts of a source event by key, preserving source order.
 *
 * The publish route validates only that `context` is present, never its shape, so every entry here
 * is untrusted: entries that are not objects, carry a `reference` instead of a `resource`, hold the
 * wrong resource type, or lack an `id` are dropped rather than passed on to be rejected later.
 * Resources repeated under one key are deduplicated by id.
 * @param contexts - The source event's context array.
 * @returns Usable resources by context key, in source order.
 */
function collectDerivableContexts(contexts: unknown): Map<FhircastDerivedContextKey, Resource[]> {
  const collected = new Map<FhircastDerivedContextKey, Resource[]>();
  if (!Array.isArray(contexts)) {
    return collected;
  }
  for (const context of contexts) {
    if (!context || typeof context !== 'object') {
      continue;
    }
    const key = (context as { key?: unknown }).key as FhircastDerivedContextKey;
    const expectedResourceType = FHIRCAST_DERIVED_CONTEXT_RESOURCE_TYPES[key];
    if (!expectedResourceType) {
      continue;
    }
    const resource = (context as { resource?: unknown }).resource;
    if (!isResource(resource, expectedResourceType) || !resource.id || typeof resource.id !== 'string') {
      continue;
    }
    let resources = collected.get(key);
    if (!resources) {
      resources = [];
      collected.set(key, resources);
    }
    if (!resources.some((existing) => existing.id === resource.id)) {
      resources.push(resource);
    }
  }
  return collected;
}

/**
 * Assembles the context array for one derived event, or gives up if a required key is missing.
 * @param rule - The rule for the event being derived.
 * @param collected - The source event's usable contexts, by key.
 * @param fanOutResource - The resource to use for the rule's `fanOutKey`, when it has one.
 * @returns The derived contexts, or `undefined` if the event cannot be derived.
 */
function buildDerivedContexts(
  rule: FhircastDerivedEventRule,
  collected: Map<FhircastDerivedContextKey, Resource[]>,
  fanOutResource?: Resource
): FhircastResourceContext[] | undefined {
  const derivedContexts: FhircastResourceContext[] = [];
  for (const key of rule.required) {
    const resource = key === rule.fanOutKey ? fanOutResource : collected.get(key)?.[0];
    if (!resource) {
      return undefined;
    }
    derivedContexts.push({ key, resource } as FhircastResourceContext);
  }
  for (const key of rule.optional) {
    const resource = collected.get(key)?.[0];
    if (resource) {
      derivedContexts.push({ key, resource } as FhircastResourceContext);
    }
  }
  return derivedContexts;
}

/**
 * Synthesizes the less specific `-open`/`-close` events implied by a source event's contexts.
 *
 * The returned events are always ordered least to most specific, whichever suffix the source has;
 * `buildFhircastPublishSequence` reverses them for a `-close`. Each one is a new notification with
 * its own `id` and `timestamp`, carrying the source's `hub.topic` and its `context.versionId` when
 * it has one — a derived event describes the same Hub context as the event it came from, so it
 * names that context's version rather than inventing one.
 *
 * This never throws and never rejects its input: a source that derives nothing, including
 * `Home-open`, `DiagnosticReport-select`, `DiagnosticReport-update`, `syncerror` and unrecognized
 * event names, simply yields an empty array. Publishing the source event must not come to depend on
 * the shape of what it carries.
 * @param source - The published notification to derive from.
 * @returns The derived notifications, least to most specific. Empty if nothing is derivable.
 */
export function deriveFhircastEventPayloads(source: FhircastMessagePayload): FhircastMessagePayload[] {
  const derived: FhircastMessagePayload[] = [];
  try {
    const event = source?.event;
    const eventName = event?.['hub.event'];
    const topic = event?.['hub.topic'];
    if (typeof eventName !== 'string' || typeof topic !== 'string' || !topic) {
      return derived;
    }
    const sourceDetails = FHIRCAST_DERIVABLE_SOURCES[eventName.toLowerCase()];
    if (!sourceDetails) {
      return derived;
    }
    const versionId = event['context.versionId'];
    const collected = collectDerivableContexts(event.context);

    // Only anchors strictly less specific than the source's are derivable from it, which is also
    // what makes derivation terminate: a derived event can never derive its own source back.
    for (let anchorIndex = 0; anchorIndex < sourceDetails.anchorIndex; anchorIndex++) {
      const anchor = FHIRCAST_ANCHOR_SPECIFICITY[anchorIndex] as FhircastDerivedAnchorResourceType;
      const rule = FHIRCAST_DERIVED_EVENT_RULES[anchor] as FhircastDerivedEventRule;
      // The event name is rebuilt from the canonical anchor rather than the source's own spelling,
      // which arrives in whatever case the publisher used.
      const derivedEventName: FhircastDerivedEventName = `${anchor}-${sourceDetails.suffix}`;
      const fanOutResources = rule.fanOutKey ? (collected.get(rule.fanOutKey) ?? []) : [undefined];
      for (const fanOutResource of fanOutResources) {
        const derivedContexts = buildDerivedContexts(rule, collected, fanOutResource);
        if (!derivedContexts) {
          continue;
        }
        try {
          derived.push(
            createFhircastMessagePayload(
              topic,
              derivedEventName,
              derivedContexts as FhircastEventContext<FhircastDerivedEventName>[],
              versionId
            )
          );
        } catch (_err) {
          // A single unsynthesizable event is skipped; the rest of the sequence still goes out
        }
      }
    }
  } catch (_err) {
    return [];
  }
  return derived;
}

/**
 * Builds the ordered list of notifications the Hub publishes for one context change.
 *
 * An `-open` runs least to most specific so a subscriber sees the patient opened before the report
 * that sits inside it; a `-close` unwinds in the opposite order, closing the report before the
 * patient. Anything that derives nothing publishes as just itself.
 *
 * The source is passed through by reference, so its `id` and `timestamp` are the ones the publisher
 * was handed in the `202` response.
 * @param source - The published notification.
 * @returns The notifications to publish to the topic, in order.
 */
export function buildFhircastPublishSequence(source: FhircastMessagePayload): FhircastMessagePayload[] {
  const derived = deriveFhircastEventPayloads(source);
  if (!derived.length) {
    return [source];
  }
  const sourceDetails = FHIRCAST_DERIVABLE_SOURCES[source.event['hub.event'].toLowerCase()];
  return sourceDetails?.suffix === 'close' ? [source, ...derived.reverse()] : [...derived, source];
}

export type FhircastConnectEvent = { type: 'connect' };
export type FhircastMessageEvent = { type: 'message'; payload: FhircastMessagePayload };
export type FhircastDisconnectEvent = { type: 'disconnect' };

export type FhircastSubscriptionEventMap = {
  connect: FhircastConnectEvent;
  message: FhircastMessageEvent;
  disconnect: FhircastDisconnectEvent;
};

export type FhircastConnectionOptions = ReconnectingWebSocketOptions & {
  /** An alternate `ReconnectingWebSocket` implementation to open the connection with. */
  ReconnectingWebSocket?: IReconnectingWebSocketCtor;
};

/**
 * A class representing a `FHIRcast` connection.
 *
 * `FhircastConnection` extends `EventTarget` and emits 3 lifecycle events:
 * 1. `connect` - An event to signal when a WebSocket connection has been opened. Fired as soon as a WebSocket emits `open`.
 * 2. `message` - Contains a `payload` field containing a `FHIRcast` message payload exactly as it comes in over WebSockets.
 * 3. `disconnect` - An event to signal when a WebSocket connection has been closed. Fired as soon as a WebSocket emits `close`.
 *
 * The underlying socket reconnects on its own, so `disconnect` followed by `connect` is the normal
 * shape of a dropped connection rather than the end of the session. A subscription endpoint stays
 * valid for the lease the Hub granted it, so reconnecting resubscribes without a new `hub.subscribe`
 * request. Two things end a connection for good: calling `connection.disconnect()`, and the Hub
 * denying the subscription — after either, `connect` will not fire again.
 */
export class FhircastConnection extends TypedEventTarget<FhircastSubscriptionEventMap> {
  readonly subRequest: SubscriptionRequest;
  private readonly websocket: IReconnectingWebSocket;

  /**
   * Creates a new `FhircastConnection`.
   * @param subRequest - The subscription request to initialize the connection from.
   * @param options - Options for the underlying `ReconnectingWebSocket`.
   */
  constructor(subRequest: SubscriptionRequest, options?: FhircastConnectionOptions) {
    super();
    this.subRequest = subRequest;
    if (!subRequest.endpoint) {
      throw new OperationOutcomeError(validationError('Subscription request should contain an endpoint.'));
    }
    if (!validateFhircastSubscriptionRequest(subRequest)) {
      throw new OperationOutcomeError(validationError('Subscription request failed validation.'));
    }

    const { ReconnectingWebSocket: WebSocketCtor = ReconnectingWebSocket, ...websocketOptions } = options ?? {};
    const websocket = new WebSocketCtor(subRequest.endpoint, undefined, websocketOptions);

    // Listeners are bound to the `ReconnectingWebSocket` rather than to a particular socket, so they
    // are attached once here and survive every reconnect. Binding them from within `open` would
    // stack up a duplicate set of listeners each time the connection came back.
    websocket.addEventListener('open', () => {
      this.dispatchEvent({ type: 'connect' });
    });

    websocket.addEventListener('message', (event: MessageEvent) => {
      const message = JSON.parse(event.data) as Record<string, string | object>;

      // The Hub's control messages carry no `event`, so there is nothing for a listener to
      // receive. A denial ends the subscription, so disconnect for good rather than reconnecting to
      // an endpoint the Hub just said it will not serve. A denial the Hub could not resolve an
      // endpoint for names no topic, so `hub.topic` alone does not identify one.
      if (!message.event) {
        if (message['hub.mode'] === 'denied') {
          this.disconnect();
        }
        return;
      }

      const fhircastMessage = message as unknown as FhircastMessagePayload;
      // Don't bubble up heartbeats, they are just noise
      if (fhircastMessage.event['hub.event'] === ('heartbeat' as unknown as FhircastEventName)) {
        return;
      }
      this.dispatchEvent({ type: 'message', payload: fhircastMessage });

      websocket.send(
        JSON.stringify({
          id: message?.id,
          timestamp: new Date().toISOString(),
        })
      );
    });

    websocket.addEventListener('close', () => {
      this.dispatchEvent({ type: 'disconnect' });
    });

    this.websocket = websocket;
  }

  disconnect(): void {
    this.websocket.close();
  }
}
