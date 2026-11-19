// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Stack, Text, Title } from '@mantine/core';
import { Document } from '@medplum/react';
import type { JSX } from 'react';
import { Link } from 'react-router';

export function LandingPage(): JSX.Element {
  return (
    <Document width={500}>
      <Stack align="center">
        <Title order={2}>Practitioner Lookup</Title>
        <Text>Sign in as a practitioner to look up another practitioner by NPI, name, specialty, or location.</Text>
        <Button component={Link} to="/signin">
          Sign in
        </Button>
      </Stack>
    </Document>
  );
}
