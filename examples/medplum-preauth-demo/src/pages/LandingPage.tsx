// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Button, Stack, Text, Title } from '@mantine/core';
import { Document } from '@medplum/react';
import type { JSX } from 'react';
import { Link } from 'react-router';

export function LandingPage(): JSX.Element {
  return (
    <Document width={500}>
      <Stack align="center">
        <Title order={2}>Pre-Authorized Code Demo</Title>
        <Text ta="center">
          This example demonstrates the{' '}
          <Anchor href="https://www.medplum.com/docs/auth/pre-authorized-code" target="_blank">
            OID4VCI pre-authorized code flow
          </Anchor>
          . A practitioner generates a magic link that lets a patient fill out a PHQ-A questionnaire without needing to
          log in.
        </Text>
        <Text ta="center" c="dimmed" size="sm">
          Sign in as a project admin to get started.
        </Text>
        <Button component={Link} to="/signin">
          Sign in
        </Button>
      </Stack>
    </Document>
  );
}
