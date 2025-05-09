import { Avatar, Badge, Button, Group, Paper, Text } from '@mantine/core';
import { IconAt } from '@tabler/icons-react';
import { JSX } from 'react';
import classes from './IntegrationCard.module.css';

export interface IntegrationCardProps {
  readonly name: string;
  readonly displayUrl: string;
  readonly url: string;
  readonly tags: string[];
  readonly description: string;
  readonly imageUrl: string;
  readonly onClick: () => void;
}

export function IntegrationCard(props: IntegrationCardProps): JSX.Element {
  return (
    <Paper radius="md" withBorder shadow="md" p="sm" bg="var(--mantine-color-body)" maw={300}>
      <Group wrap="nowrap">
        <Avatar src={props.imageUrl} size={48} radius="md" />
        <div>
          <Text fz="lg" fw={500}>
            {props.name}
          </Text>
          <Group wrap="nowrap" gap={4} mt={3}>
            <IconAt stroke={1.5} size={16} className={classes.icon} />
            <Text fz="xs" c="dimmed">
              {props.displayUrl}
            </Text>
          </Group>
        </div>
      </Group>
      <Group mt="sm">
        {props.tags.map((tag) => (
          <Badge variant="light" color="gray" key={tag}>
            {tag}
          </Badge>
        ))}
      </Group>
      <Text fz="sm" mt="sm" h={80}>
        {props.description}
      </Text>
      <Button variant="default" fullWidth mt="md" onClick={props.onClick}>
        Request Integration
      </Button>
    </Paper>
  );
}
