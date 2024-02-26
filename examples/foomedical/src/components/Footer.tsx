import { Anchor, Container, Divider, SimpleGrid, Stack, Text } from '@mantine/core';
import classes from './Footer.module.css';

export function Footer(): JSX.Element {
  return (
    <footer className={classes.footer}>
      <div className={classes.inner}>
        <Container p="xl">
          <Stack gap="xl">
            <SimpleGrid cols={4}>
              <Anchor href="https://www.medplum.com/docs/tutorials/api-basics/create-fhir-data">Getting started</Anchor>
              <Anchor href="https://www.medplum.com/docs/tutorials">Playing with Medplum</Anchor>
              <Anchor href="https://github.com/medplum/foomedical">Open Source</Anchor>
              <Anchor href="https://www.medplum.com/docs">Documentation</Anchor>
            </SimpleGrid>
            <Divider />
            <Text c="dimmed" size="sm">
              &copy; {new Date().getFullYear()} Foo Medical, Inc. All rights reserved.
            </Text>
          </Stack>
        </Container>
      </div>
    </footer>
  );
}
