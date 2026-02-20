// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getIdentifier, setIdentifier } from '@medplum/core';
import type { Identifier, Resource } from '@medplum/fhirtypes';
import { v4 as uuidv4 } from 'uuid';

const MedplumSchedulingTransientIdentifierURI = 'https://medplum.com/fhir/scheduling-transient-id';

export const SchedulingTransientIdentifier = {
  set(resource: Resource & { identifier?: Identifier[] }) {
    setIdentifier(resource, MedplumSchedulingTransientIdentifierURI, uuidv4(), { use: 'temp' });
  },

  get(resource: Resource) {
    return getIdentifier(resource, MedplumSchedulingTransientIdentifierURI);
  },
};
