// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MenuProps } from '@mantine/core';

/** Limits menu height to the space beside the button. Width stays on the Menu `width` prop. */
export const userMenuMiddlewares: NonNullable<MenuProps['middlewares']> = {
  flip: true,
  shift: true,
  size: {
    padding: 8,
    apply({ availableHeight, elements }) {
      if (availableHeight > 0 && Number.isFinite(availableHeight)) {
        elements.floating.style.maxHeight = `${Math.floor(availableHeight)}px`;
      } else {
        elements.floating.style.maxHeight = '';
      }
    },
  },
};
