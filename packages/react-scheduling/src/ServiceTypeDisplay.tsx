// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { TextProps } from '@mantine/core';
import { getExtensionValue, isReference, ServiceTypeReferenceURI } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import { ResourceName } from '@medplum/react';
import type { JSX } from 'react';
import { partitionServiceTypes } from './serviceTypes';

export interface ServiceTypeDisplayProps extends TextProps {
  readonly appointment: Appointment;
}

export function ServiceTypeDisplay(props: Readonly<ServiceTypeDisplayProps>): JSX.Element | null {
  const { appointment, ...rest } = props;
  const { visitType } = partitionServiceTypes(appointment);
  const serviceRef = getExtensionValue(visitType, ServiceTypeReferenceURI);
  if (isReference(serviceRef, 'HealthcareService')) {
    return <ResourceName value={serviceRef} {...rest} />;
  }
  return <>No service type</>;
}
