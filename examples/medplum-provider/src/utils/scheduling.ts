// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { generateId, getIdentifier, setIdentifier } from '@medplum/core';
import type { Identifier, Resource } from '@medplum/fhirtypes';

const MedplumSchedulingTransientIdentifierURI = 'https://medplum.com/fhir/scheduling-transient-id';

/**
 * Tags resources that do not exist on the server yet, such as the proposed
 * Appointments and Slots returned by `$find`, with a `use: 'temp'` identifier.
 * This gives clients a stable key for a resource that has no `id`. Call
 * `remove` before persisting, so the identifier never reaches the server.
 */
export const SchedulingTransientIdentifier = {
  set(resource: Resource & { identifier?: Identifier[] }) {
    setIdentifier(resource, MedplumSchedulingTransientIdentifierURI, generateId(), { use: 'temp' });
  },

  get(resource: Resource) {
    return getIdentifier(resource, MedplumSchedulingTransientIdentifierURI);
  },

  remove(resource: Resource & { identifier?: Identifier[] }) {
    resource.identifier = resource.identifier?.filter(
      (identifier) => identifier.system !== MedplumSchedulingTransientIdentifierURI
    );
  },
};
