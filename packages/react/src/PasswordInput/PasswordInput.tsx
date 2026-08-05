// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PasswordInputProps } from '@mantine/core';
import { PasswordInput as MantinePasswordInput } from '@mantine/core';
import type { JSX } from 'react';

/**
 * Mantine's `PasswordInput` sets `tabIndex={-1}` and `aria-hidden` on the visibility toggle button
 * unless `visibilityToggleButtonProps` is provided, which removes it from the keyboard tab order and
 * hides it from assistive technology. This wrapper defaults the toggle to be keyboard accessible.
 * @param props - The password input props.
 * @returns The password input component.
 */
export function PasswordInput(props: PasswordInputProps): JSX.Element {
  const { visibilityToggleButtonProps, ...rest } = props;
  return (
    <MantinePasswordInput
      {...rest}
      visibilityToggleButtonProps={{
        'aria-label': 'Toggle password visibility',
        tabIndex: 0,
        ...visibilityToggleButtonProps,
      }}
    />
  );
}
