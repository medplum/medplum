// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Stack, Text, Title } from '@mantine/core';
import { Document } from '@medplum/react';
import type { JSX } from 'react';
import { Link } from 'react-router';

export function LandingPage(): JSX.Element {
  return (
    <Document width={560}>
      <Stack align="center">
        <Title order={2}>Access Policy Explorer</Title>
        <Text>
          See how several access policies combine for one project membership: which entry wins for each resource type
          and interaction, which hidden or read-only fields are skipped, and what filter searches run with. Sign in as a
          project admin so the app can read your AccessPolicy and ProjectMembership resources.
        </Text>
        <Button component={Link} to="/signin">
          Sign in
        </Button>
      </Stack>
    </Document>
  );
}
