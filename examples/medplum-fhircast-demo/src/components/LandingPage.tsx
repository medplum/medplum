import { Button, Stack, Text, Title } from '@mantine/core';
import { Document } from '@medplum/react';
import { Link } from 'react-router-dom';

export default function LandingPage(): JSX.Element {
  return (
    <Document width={800}>
      <Stack align="center">
        <Title order={1} fz={36}>
          Welcome to the Medplum FHIRcast Demo!
        </Title>
        <Text>
          This example demonstrates how to use Medplum's builtin FHIRcast capabilities. <br /> Through this example, you
          will learn how to utilize both "publish" and "subscribe" sides of the FHIRcast protocol.
        </Text>
        <Text size="lg">Start by signing in!</Text>
        <Button component={Link} to="/signin" size="lg" radius="xl">
          Sign in
        </Button>
      </Stack>
    </Document>
  );
}
