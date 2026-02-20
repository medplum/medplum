// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { EMPTY, isDefined } from '@medplum/core';
import type { ActivityDefinition, CodeableConcept, Schedule } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { SchedulingContext } from './contexts';

const SchedulingParametersURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters';
type DayOfWeekName = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

// The duration units we allow in the SchedulingParameters extension
// - "ms", "s" are not allowed due to being too fine grained (scheduling works at minute intervals only)
// - "mo", "a" are not allowed due to being ambiguous (months have different lengths, leap years have different length)
type DurationUnit = 'h' | 'min' | 'd' | 'wk';

// The SchedulingParameters extension constrains durations:
// - No comparator allowed; only exact durations supported
// - `value` is required
// - `unit` is required, and must be in a subset of values
type HardDuration = {
  value: number;
  unit: DurationUnit;
};

// The allowed nested extensions
type SchedulingParametersExtensionExtension =
  | { url: 'bufferBefore'; valueDuration: HardDuration }
  | { url: 'bufferAfter'; valueDuration: HardDuration }
  | { url: 'alignmentInterval'; valueDuration: HardDuration }
  | { url: 'alignmentOffset'; valueDuration: HardDuration }
  | { url: 'duration'; valueDuration: HardDuration }
  | { url: 'serviceType'; valueCodeableConcept: CodeableConcept }
  | { url: 'timezone'; valueCode: string }
  | {
      url: 'availability';
      valueTiming: {
        repeat: {
          dayOfWeek: DayOfWeekName[];
          timeOfDay: `${number}:${number}:${number}`[];
          duration: number;
          durationUnit: 'h' | 'min' | 'd' | 'wk';
        };
      };
    };

export type SchedulingParametersExtension = {
  url: typeof SchedulingParametersURI;
  extension: SchedulingParametersExtensionExtension[];
};

export type SchedulingContextValue = {
  availableSchedulingParameters: readonly SchedulingParametersExtension[];
  selectedSchedulingParameters: SchedulingParametersExtension | undefined;
  setSelectedSchedulingParameters: (parameters: SchedulingParametersExtension | undefined) => void;
  serviceTypes: ServiceTypeOption[];
};

export type ServiceTypeOption = {
  id: string;
  schedulingParameters: SchedulingParametersExtension;
  serviceType: CodeableConcept | undefined;
};

type SchedulingContextProviderProps = {
  resources: (ActivityDefinition | Schedule | undefined)[];
  children: React.ReactNode;
};

export const SchedulingContextProvider = (props: SchedulingContextProviderProps): JSX.Element => {
  const { resources, children } = props;
  const [selectedSchedulingParameters, setSelectedSchedulingParameters] = useState<
    SchedulingParametersExtension | undefined
  >(undefined);
  const availableSchedulingParameters = useMemo(() => {
    return resources
      .filter(isDefined)
      .flatMap(
        (resource) =>
          (resource.extension ?? EMPTY).filter(
            (ext) => ext.url === SchedulingParametersURI
          ) as SchedulingParametersExtension[]
      );
  }, [resources]);

  // create a stable array of ServiceType options with locally unique IDs
  // (useful as React keys).
  //
  // Any scheduling parameters without any serviceType entries are given the "wildcard"
  // service type, represented by `undefined`
  const serviceTypeOptions = useMemo(() => {
    return availableSchedulingParameters.flatMap((schedulingParameters): ServiceTypeOption[] => {
      const serviceTypes = schedulingParameters.extension.filter((ext) => ext.url === 'serviceType');
      if (!serviceTypes.length) {
        return [
          {
            id: uuidv4(),
            schedulingParameters,
            serviceType: undefined,
          },
        ];
      }
      return serviceTypes.map((ext) => ({
        id: uuidv4(),
        schedulingParameters,
        serviceType: ext.valueCodeableConcept,
      }));
    });
  }, [availableSchedulingParameters]);

  const value: SchedulingContextValue = useMemo(
    () => ({
      availableSchedulingParameters,
      selectedSchedulingParameters,
      setSelectedSchedulingParameters,
      serviceTypes: serviceTypeOptions,
    }),
    [availableSchedulingParameters, selectedSchedulingParameters, serviceTypeOptions]
  );

  return <SchedulingContext.Provider value={value}>{children}</SchedulingContext.Provider>;
};
