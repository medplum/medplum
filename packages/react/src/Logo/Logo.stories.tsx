// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Logo } from './Logo';

export default {
  title: 'Medplum/Logo',
  component: Logo,
} as Meta;

export const Basic = (): JSX.Element => <Logo size={200} />;
