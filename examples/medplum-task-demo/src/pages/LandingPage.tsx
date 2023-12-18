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
          This "Task Demo" example demonstrates how to build a simple React application based around the
          <Anchor href="https://www.medplum.com/docs/api/fhir/resources/task">Task</Anchor> resource and its workflows.
          If you haven't already done so, <Anchor href="https://app.medplum.com/register">register</Anchor> for Medplum
          Project. After that you can sign into your project by clicking the link below.
        </Text>
        <Button component={Link} to="/signin" size="lg" radius="xl">
          Sign in
        </Button>
      </Stack>
    </Document>
  );
}
