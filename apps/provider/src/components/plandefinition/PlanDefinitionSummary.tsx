// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Card, Stack, Text } from '@mantine/core';
import type { PlanDefinition, PlanDefinitionAction } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import classes from './PlanDefinitionSummary.module.css';

export function PlanDefinitionSummary(props: { planDefinition: PlanDefinition | undefined }): JSX.Element | null {
  const { planDefinition } = props;
  if (!planDefinition?.action?.length) {
    return null;
  }

  return (
    <Card className={classes.planDefinition}>
      <Stack gap={0}>
        <Text fw={500}>Included Tasks</Text>
        {planDefinition.action.map((action: PlanDefinitionAction) => (
          <Text key={action.id}>- {action.title}</Text>
        ))}
      </Stack>
    </Card>
  );
}
