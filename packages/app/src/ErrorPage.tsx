// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Stack, Text, Title } from '@mantine/core';
import { Document } from '@medplum/react';
import { JSX } from 'react';

export function ErrorPage(): JSX.Element {
  return (
    <Document>
      <Stack>
        <Title order={1}>Unexpected Error</Title>
        <Text>We're sorry, something went wrong.</Text>
        <Text>
          Please contact <Anchor href="mailto:support@medplum.com">support</Anchor> for assistance.
        </Text>
      </Stack>
    </Document>
  );
}
