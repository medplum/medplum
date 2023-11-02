import { Flex, Group, Paper, RingProgress, SimpleGrid, Text, Title } from '@mantine/core';
import { MeasureReport, MeasureReportGroup, Reference } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import React from 'react';
import { QuantityDisplay } from '../QuantityDisplay/QuantityDisplay';

export interface MeasureReportDisplayProps {
  measureReport: MeasureReport | Reference<MeasureReport>;
}

export function MeasureReportDisplay(props: MeasureReportDisplayProps): JSX.Element | null {
  const report = useResource(props.measureReport);
  if (!report) {
    return null;
  }

  return (
    <SimpleGrid cols={3} spacing={'xs'}>
      {report.group?.map((group) => <MeasureReportDisplayGroup key={group.id} group={group} />)}
    </SimpleGrid>
  );
}

function MeasureReportDisplayGroup(props: any): JSX.Element | null {
  const { group } = props;
  const unit = group.measureScore?.unit;
  return (
    <Paper withBorder radius="md" p="xs" display="flex" sx={{ alignItems: 'center', justifyContent: 'center' }}>
      <Group>
        {unit === '%' ? (
          <RingProgress
            size={120}
            thickness={12}
            roundCaps
            sections={[{ value: setGroupValue(group), color: setColor(group.measureScore.value) }]}
            label={
              <Flex justify="center">
                <Text fw={700} fz={18}>
                  <QuantityDisplay value={group.measureScore} />
                </Text>
              </Flex>
            }
          />
        ) : (
          <Title order={3}>
            <QuantityDisplay value={group.measureScore} />
          </Title>
        )}
      </Group>
    </Paper>
  );
}

function setGroupValue(group: MeasureReportGroup): number {
  const score = group.measureScore?.value;
  const unit = group.measureScore?.unit;
  if (!score) {
    return 0;
  }
  if (score <= 1 && unit === '%') {
    return score * 100;
  }
  return score;
}

function setColor(score: number): string {
  if (score <= 33) {
    return 'red';
  }
  if (score <= 67) {
    return 'yellow';
  }
  return 'green';
}
