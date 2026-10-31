// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AppShell, Box, Container, Group, MantineProvider, Stack, Text, createTheme } from '@mantine/core';
import { Document, Logo } from '@medplum/react';
import type { JSX, ReactNode } from 'react';

// Teal accent for the patient-facing pages only; the practitioner app keeps the default theme
const patientTheme = createTheme({ primaryColor: 'teal', primaryShade: 8 });

export interface PatientPageLayoutProps {
  readonly width?: number;
  /** Optional heading content rendered above the card */
  readonly hero?: ReactNode;
  readonly children: ReactNode;
}

export function PatientPageLayout({ width = 600, hero, children }: PatientPageLayoutProps): JSX.Element {
  return (
    <MantineProvider theme={patientTheme} cssVariablesSelector=".patient-pages" withGlobalClasses={false}>
      <AppShell className="patient-pages" header={{ height: 80 }}>
        <AppShell.Header>
          <Container size={1200} h="100%">
            <Group h="100%" gap="xs">
              <Logo size={32} />
              <Text fw={700} size="xl" c="teal.8">
                Foo Medical
              </Text>
            </Group>
          </Container>
        </AppShell.Header>
        <AppShell.Main bg="radial-gradient(640px at left top, var(--mantine-primary-color-light), var(--mantine-color-gray-0))">
          <Stack gap="xl" py="xl" mih="calc(100vh - 80px - 120px)">
            {hero && (
              <Container size={width} w="100%">
                {hero}
              </Container>
            )}
            <Document width={width}>{children}</Document>
          </Stack>
        </AppShell.Main>
        <Box component="footer" bg="gray.1" bd="1px solid gray.2">
          <Container size={1200} py="xl">
            <Text c="dimmed" size="sm" ta="center">
              &copy; {new Date().getFullYear()} Foo Medical. Secured by Medplum.
            </Text>
          </Container>
        </Box>
      </AppShell>
    </MantineProvider>
  );
}
