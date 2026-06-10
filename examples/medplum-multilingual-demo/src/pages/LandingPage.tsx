// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Button, Stack, Text, Title } from '@mantine/core';
import { Document } from '@medplum/react';
import type { JSX } from 'react';
import { Link } from 'react-router';

export function LandingPage(): JSX.Element {
  return (
    <Document width={540}>
      <Stack align="center" gap="md">
        <Title order={2}>Multilingual FHIR Demo</Title>
        <Text ta="center">
          This demo shows how to use the FHIR{' '}
          <Anchor href="http://hl7.org/fhir/StructureDefinition/translation" target="_blank">
            translation extension
          </Anchor>{' '}
          to store and display multilingual content in FHIR resources — covering Questionnaire items, Coding display
          strings, and patient preferred language.
        </Text>
        <Text ta="center" c="dimmed" size="sm">
          Sign in with your{' '}
          <Anchor href="https://app.medplum.com/register" target="_blank">
            Medplum account
          </Anchor>{' '}
          to get started.
        </Text>
        <Button component={Link} to="/signin" size="md">
          Sign in
        </Button>
      </Stack>
    </Document>
  );
}
