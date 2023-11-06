import { Box, Flex, Group, Paper, RingProgress, SimpleGrid, Text, Title } from '@mantine/core';
import { Measure, MeasureReport, MeasureReportGroup, Reference } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import React, { useEffect } from 'react';
import { QuantityDisplay } from '../QuantityDisplay/QuantityDisplay';

export interface MeasureReportDisplayProps {
  measureReport: MeasureReport | Reference<MeasureReport>;
}

export function MeasureReportDisplay(props: MeasureReportDisplayProps): JSX.Element | null {
  const medplum = useMedplum();
  const report = useResource(props.measureReport);
  const [measure, setMeasure] = React.useState<Measure | undefined>();

  useEffect(() => {
    medplum
      .searchOne('Measure', { url: report?.measure })
      .then((result: Measure | undefined) => {
        setMeasure(result);
      })
      .catch(console.log);
  }, [medplum, report?.measure]);

  if (!report) {
    return null;
  }
  console.log(measure)
  return (
    <Box>
      {measure && <MeasureTitle measure={measure} />}
      <SimpleGrid cols={3} spacing={'xs'}>
        {report.group?.map((group: MeasureReportGroup) => <MeasureReportDisplayGroup key={group.id} group={group} />)}
      </SimpleGrid>
    </Box>
  );
}

function MeasureReportDisplayGroup(props: any): JSX.Element | null {
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

function MeasureReportPopulation(props: any): JSX.Element {
  const { group } = props;
  const populations = group.population;
  const numerator = populations?.find((p: any) => p.code?.coding?.[0].code === 'numerator');
  const denominator = populations?.find((p: any) => p.code?.coding?.[0].code === 'denominator');

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

function MeasureTitle(props: { measure: Measure }): JSX.Element {
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
