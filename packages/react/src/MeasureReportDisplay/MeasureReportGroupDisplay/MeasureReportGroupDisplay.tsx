import { Box, Flex, Group, Paper, RingProgress, Text, Title } from '@mantine/core';
import { formatCodeableConcept } from '@medplum/core';
import { Measure, MeasureReportGroup } from '@medplum/fhirtypes';
import { QuantityDisplay } from '../../QuantityDisplay/QuantityDisplay';

interface MeasureReportGroupDisplayProps {
  readonly group: MeasureReportGroup;
}

interface MeasureProps {
  readonly measure: Measure;
}

export function MeasureReportGroupDisplay(props: MeasureReportGroupDisplayProps): JSX.Element | null {
  const { group } = props;
  return (
    <Paper withBorder radius="md" p="xs" display="flex" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Group>
        {group.measureScore && <MeasureScore group={group} />}
        {!group.measureScore && <MeasureReportPopulation group={group} />}
      </Group>
    </Paper>
  );
}

export function MeasureTitle(props: MeasureProps): JSX.Element {
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

function MeasureReportPopulation(props: MeasureReportGroupDisplayProps): JSX.Element {
  const { group } = props;
  const populations = group.population;
  const numerator = populations?.find((p: any) => formatCodeableConcept(p.code) === 'numerator');
  const denominator = populations?.find((p: any) => formatCodeableConcept(p.code) === 'denominator');

  const numeratorCount = numerator?.count;
  const denominatorCount = denominator?.count;

  if (denominatorCount === 0) {
    return (
      <Box>
        <Title order={3}>Not Applicable</Title>
        <Text>{`Denominator: ${denominatorCount}`}</Text>
      </Box>
    );
  }

  if (numeratorCount === undefined || denominatorCount === undefined) {
    return (
      <Box>
        <Title order={3}>Insufficient Data</Title>
        <Text>{`Numerator: ${numeratorCount}`}</Text>
        <Text>{`Denominator: ${denominatorCount}`}</Text>
      </Box>
    );
  }

  const value = (numeratorCount / denominatorCount) * 100;
  return (
    <RingProgress
      size={120}
      thickness={12}
      roundCaps
      sections={[{ value: value, color: groupColor(value) }]}
      label={
        <Flex justify="center">
          <Text fw={700} fz={18}>
            {numeratorCount} / {denominatorCount}
          </Text>
        </Flex>
      }
    />
  );
}

function MeasureScore(props: MeasureReportGroupDisplayProps): JSX.Element {
  const { group } = props;
  const unit = group.measureScore?.unit ?? group.measureScore?.code;

  return (
    <>
      {unit === '%' ? (
        <RingProgress
          size={120}
          thickness={12}
          roundCaps
          sections={[{ value: groupValue(group), color: groupColor(group?.measureScore?.value ?? 0) }]}
          label={
            <Flex justify="center">
              <Text fw={700} fz={18}>
                <QuantityDisplay value={group.measureScore} />
              </Text>
            </Flex>
          }
        />
      ) : (
        <Flex h={120} align="center">
          <Title order={3}>
            <QuantityDisplay value={group.measureScore} />
          </Title>
        </Flex>
      )}
    </>
  );
}

function groupValue(group: MeasureReportGroup): number {
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

function groupColor(score: number): string {
  if (score <= 33) {
    return 'red';
  }
  if (score <= 67) {
    return 'yellow';
  }
  return 'green';
}
