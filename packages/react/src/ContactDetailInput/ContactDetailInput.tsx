// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, TextInput } from '@mantine/core';
import { ContactDetail, ContactPoint } from '@medplum/fhirtypes';
import { JSX, useContext, useMemo, useRef, useState } from 'react';
import { ContactPointInput } from '../ContactPointInput/ContactPointInput';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';

export type ContactDetailInputProps = ComplexTypeInputProps<ContactDetail>;

export function ContactDetailInput(props: ContactDetailInputProps): JSX.Element {
  const [contactDetail, setContactDetail] = useState(props.defaultValue);

  const ref = useRef<ContactDetail>(contactDetail);
  ref.current = contactDetail;

  const { getExtendedProps } = useContext(ElementsContext);
  const [nameProps, telecomProps] = useMemo(
    () => ['name', 'telecom'].map((field) => getExtendedProps(props.path + '.' + field)),
    [getExtendedProps, props.path]
  );

  function setContactDetailWrapper(newValue: ContactDetail): void {
    setContactDetail(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  function setName(name: string): void {
    const newValue: ContactDetail = { ...ref.current, name };
    if (!name) {
      delete newValue.name;
    }
    setContactDetailWrapper(newValue);
  }

  function setTelecom(telecom: ContactPoint | undefined): void {
    const newValue: ContactDetail = { ...ref.current, telecom: telecom && [telecom] };
    if (!telecom) {
      delete newValue.telecom;
    }
    setContactDetailWrapper(newValue);
  }

  return (
    <Group gap="xs" grow wrap="nowrap">
      <TextInput
        disabled={props.disabled || nameProps?.readonly}
        data-testid={props.name + '-name'}
        name={props.name + '-name'}
        placeholder="Name"
        style={{ width: 180 }}
        defaultValue={contactDetail?.name}
        onChange={(e) => setName(e.currentTarget.value)}
      />
      <ContactPointInput
        disabled={props.disabled || telecomProps?.readonly}
        name={props.name + '-telecom'}
        path={props.path + '.telecom'}
        defaultValue={contactDetail?.telecom?.[0]}
        onChange={setTelecom}
        outcome={props.outcome}
      />
    </Group>
  );
}
