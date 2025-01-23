import { Button, Stack, Text, Title } from '@mantine/core';
import { Document } from '@medplum/react';
import { Link } from 'react-router-dom';

export function LandingPage(): JSX.Element {
  return (
    <Document width={500}>
      <Stack align="center">
        <Title order={2}>Welcome!</Title>
        <Text>
          <p>
            This demo shows how to work with FHIR ValueSets. You can either search for existing ValueSets on the left,
            or create your own custom ValueSet on the right. Once a ValueSet is selected or created, you can use it for
            typeaheads.
          </p>
        </Text>
        <Button component={Link} to="/signin">
          Sign in
        </Button>
      </Stack>
    </Document>
  );
}
