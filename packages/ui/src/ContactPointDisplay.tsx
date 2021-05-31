import { ContactPoint } from '@medplum/core';
import React from 'react';

export interface ContactPointDisplayProps {
  value?: ContactPoint;
}

export function ContactPointDisplay(props: ContactPointDisplayProps) {
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
