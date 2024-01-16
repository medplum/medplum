import { Anchor, Button, Stack, Text, Title } from '@mantine/core';
import { Document } from '@medplum/react';
import { Link } from 'react-router-dom';

export function LandingPage(): JSX.Element {
  return (
    <Document width={500}>
      <Stack align="center">
        <Title order={1} fz={36}>
          Welcome!
        </Title>
        <Text>
          This "Live Chat" example demonstrates how to build a simple React live chat application that utilizes Medplum
          WebSocket subscriptions to sync chat messages modeled as{' '}
          <Anchor href="https://www.medplum.com/docs/communications">Communication</Anchor> resources between two
          clients.
        </Text>
        <Button component={Link} to="/signin" size="lg" radius="xl">
          Sign in
        </Button>
      </Stack>
    </Document>
  );
}
