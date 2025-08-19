// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Avatar, Badge, Button, Group, Paper, Text } from '@mantine/core';
import { IconWorld } from '@tabler/icons-react';
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
    <Paper radius="md" withBorder shadow="md" p="md" bg="var(--mantine-color-body)" maw={300}>
      <Group wrap="nowrap">
        <Avatar
          src={props.imageUrl}
          size={48}
          radius="md"
          style={{ border: '1px solid var(--mantine-color-gray-2)' }}
        />
        <div>
          <Text fz="xl" fw={800}>
            {props.name}
          </Text>
          <Group wrap="nowrap" gap={4} mt={-2}>
            <IconWorld stroke={2} size={12} color="var(--mantine-primary-color-6)" className={classes.icon} />
            <Text fz="xs" c="dimmed">
              <a
                href={props.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--mantine-primary-color-6)', textDecoration: 'none' }}
              >
                {props.displayUrl}
              </a>
            </Text>
          </Group>
        </div>
      </Group>
      <Group mt="sm" gap={4}>
        {props.tags.map((tag) => (
          <Badge variant="light" color="gray" key={tag} size="sm">
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
