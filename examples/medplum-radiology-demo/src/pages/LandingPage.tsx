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
        <Title order={2}>Radiology Reading Worklist</Title>
        <Text>
          This example demonstrates a radiologist worklist: pick a study, dictate a DiagnosticReport with voice input,
          and resume the draft later. If you haven't already,{' '}
          <Anchor href="https://app.medplum.com/register">register</Anchor> for a Medplum project, then sign in below.
        </Text>
        <Button component={Link} to="/signin">
          Sign in
        </Button>
      </Stack>
    </Document>
  );
}
