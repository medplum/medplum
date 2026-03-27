// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getExtensionValue, getIdentifier, isDefined, setIdentifier } from '@medplum/core';
import type { CodeableConcept, Identifier, Resource, Schedule } from '@medplum/fhirtypes';
import { v4 as uuidv4 } from 'uuid';

const SchedulingParametersURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters';
const MedplumSchedulingTransientIdentifierURI = 'https://medplum.com/fhir/scheduling-transient-id';

export const SchedulingTransientIdentifier = {
  set(resource: Resource & { identifier?: Identifier[] }) {
    setIdentifier(resource, MedplumSchedulingTransientIdentifierURI, uuidv4(), { use: 'temp' });
  },

  get(resource: Resource) {
    return getIdentifier(resource, MedplumSchedulingTransientIdentifierURI);
  },
};

export function serviceTypesFromSchedulingParameters(schedule: Schedule): CodeableConcept[] {
  const extensions = schedule?.extension?.filter((ext) => ext.url === SchedulingParametersURI) ?? [];
  const serviceTypes = extensions.map((ext) => getExtensionValue(ext, 'serviceType') as CodeableConcept | undefined);
  return serviceTypes.filter(isDefined);
}
