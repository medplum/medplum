// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContactDetail } from '@medplum/fhirtypes';
import { JSX } from 'react';
import { ContactPointDisplay } from '../ContactPointDisplay/ContactPointDisplay';

export interface ContactDetailDisplayProps {
  readonly value?: ContactDetail;
}

export function ContactDetailDisplay(props: ContactDetailDisplayProps): JSX.Element | null {
  const contactDetail = props.value;
  if (!contactDetail) {
    return null;
  }

  return (
    <>
      {contactDetail.name}
      {contactDetail.name && ': '}
      {contactDetail.telecom?.map((telecom) => (
        <ContactPointDisplay key={`telecom-${contactDetail.name}-${telecom.value}`} value={telecom} />
      ))}
    </>
  );
}
