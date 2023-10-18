import { Button, Group, List, Stack, Text, Title } from '@mantine/core';
import { Document } from '@medplum/react';
import { Link } from 'react-router-dom';

export default function DemoInstructionsPage(): JSX.Element {
  return (
    <Document width={800}>
      <Stack align="center">
        <Title fz={36}>Running the demo</Title>
        <Text>
          Now that you are signed in, we can take a look at how we can utilize Medplum's FHIRcast capabilities. There
          are 2 main functionalities we care about for FHIRcast. They are:
        </Text>
        <List>
          <List.Item>Creating and publishing to a topic as the "publisher"</List.Item>
          <List.Item>Subscribing to a topic as a "subscriber"</List.Item>
        </List>
        <Text>
          A topic is basically a FHIRcast "session". These are ephemeral and usually only last as long as a user needs
          to sync subscribers to the publishing app during a work session. Now let's take a look how both of these roles
          work!
        </Text>
        <Text size="lg">Open both of these in a new tab...</Text>
        <Group>
          <Button component={Link} to="/publisher" size="md" radius="xl">
            Publisher
          </Button>
          <Button component={Link} to="/subscriber" size="md" radius="xl">
            Subscriber
          </Button>
        </Group>
        <Text>Then put the tabs side by side. This will make it easier to watch what they are both doing.</Text>
      </Stack>
    </Document>
  );
}
