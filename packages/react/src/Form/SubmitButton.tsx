// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ButtonProps } from '@mantine/core';
import { Button } from '@mantine/core';
import type { JSX } from 'react';
import { useContext } from 'react';
import { FormContext } from './Form.context';

export type SubmitButtonProps = Omit<ButtonProps, 'type' | 'loading'>;

export function SubmitButton(props: ButtonProps): JSX.Element {
  const { children, ...buttonProps } = props;
  const { submitting } = useContext(FormContext);
  return (
    <Button type="submit" loading={submitting} {...buttonProps}>
      {children}
    </Button>
  );
}
