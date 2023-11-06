import { Flex, Group, Paper, RingProgress, Text, Title } from '@mantine/core';
import { formatCodeableConcept } from '@medplum/core';
import { Measure, MeasureReportGroup } from '@medplum/fhirtypes';
import React from 'react';
import { QuantityDisplay } from '../../QuantityDisplay/QuantityDisplay';

export function MeasureReportDisplayGroup(props: any): JSX.Element | null {
  const { group } = props;
  return (
    <Paper withBorder radius="md" p="xs" display="flex" sx={{ alignItems: 'center', justifyContent: 'center' }}>
      <Group>
        {group.measureScore && <MeasureScore group={group} />}
        {!group.measureScore && <MeasureReportPopulation group={group} />}
      </Group>
    </Paper>
  );
}

export function MeasureTitle(props: { measure: Measure }): JSX.Element {
  const { measure } = props;
  return (
    <>
      <Text fz="md" fw={500} mb={8}>
        {measure.title}
      </Text>
      <Text fz="xs" c="dimmed" mb={8}>
        {measure.subtitle}
      </Text>
    </>
  );
}


function MeasureReportPopulation(props: any): JSX.Element {
  const { group } = props;
  const populations = group.population;
  const numerator = populations?.find((p: any) => formatCodeableConcept(p.code) === 'numerator');
  const denominator = populations?.find((p: any) => formatCodeableConcept(p.code) === 'denominator');

  const value = (numerator?.count / denominator?.count) * 100;
  return (
    <RingProgress
      size={120}
      thickness={12}
      roundCaps
      sections={[{ value: value, color: setColor(value) }]}
      label={
        <Flex justify="center">
          <Text fw={700} fz={18}>
            {numerator.count} / {denominator.count}
          </Text>
        </Flex>
      }
    />
  );
}

function MeasureScore(props: any): JSX.Element {
  const { group } = props;
  const unit = group.measureScore?.unit;

  return (
    <>
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
    </>
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
