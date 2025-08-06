// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContactPoint } from '@medplum/fhirtypes';
import { JSX } from 'react';

export interface ContactPointDisplayProps {
  readonly value?: ContactPoint;
}

export function ContactPointDisplay(props: ContactPointDisplayProps): JSX.Element | null {
  const contactPoint = props.value;
  if (!contactPoint) {
    return null;
  }

  const builder = [];

  if (contactPoint.value) {
    builder.push(contactPoint.value);
  }

  if (contactPoint.use || contactPoint.system) {
    builder.push(' [');

    if (contactPoint.use) {
      builder.push(contactPoint.use);
    }

    if (contactPoint.use && contactPoint.system) {
      builder.push(' ');
    }

    if (contactPoint.system) {
      builder.push(contactPoint.system);
    }

    builder.push(']');
  }

  return <>{builder.join('').trim()}</>;
}
