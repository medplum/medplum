// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack } from '@mantine/core';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { UnavailableNote } from './UnavailableNote';

export default {
  title: 'Medplum/UnavailableNote',
  component: UnavailableNote,
} as Meta;

export const SuggestionsUnavailable = (): JSX.Element => (
  <Document>
    <UnavailableNote
      text="Suggestions unavailable"
      color="yellow.9"
      message="Value set http://example.com/my-value-set is unavailable"
    />
  </Document>
);

export const FieldUnavailable = (): JSX.Element => (
  <Document>
    <UnavailableNote
      text="This field is unavailable."
      color="red"
      message="Value set http://example.com/my-value-set is unavailable"
    />
  </Document>
);

export const BothVariants = (): JSX.Element => (
  <Document>
    <Stack>
      <UnavailableNote
        text="Suggestions unavailable"
        color="yellow.9"
        message="Value set http://example.com/my-value-set is unavailable"
      />
      <UnavailableNote
        text="This field is unavailable."
        color="red"
        message="Value set http://example.com/my-value-set is unavailable"
      />
    </Stack>
  </Document>
);
