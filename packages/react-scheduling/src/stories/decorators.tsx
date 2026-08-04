// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Decorator } from '@storybook/react';
import { MockDateWrapper } from './MockDateWrapper';

// Freezes the system clock so date/time-dependent stories are deterministic.
export const withMockedDate: Decorator = (Story) => (
  <MockDateWrapper>
    <Story />
  </MockDateWrapper>
);
