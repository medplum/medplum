// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, ButtonProps } from '@mantine/core';
import { JSX, useContext } from 'react';
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
