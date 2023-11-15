import { Box, SimpleGrid } from '@mantine/core';
import { MeasureReport, MeasureReportGroup, Reference } from '@medplum/fhirtypes';
import { useResource, useSearchOne } from '@medplum/react-hooks';
import { MeasureReportGroupDisplay, MeasureTitle } from './MeasureReportGroupDisplay/MeasureReportGroupDisplay';

export interface MeasureReportDisplayProps {
  readonly measureReport: MeasureReport | Reference<MeasureReport>;
}

export function MeasureReportDisplay(props: MeasureReportDisplayProps): JSX.Element | null {
  const report = useResource(props.measureReport);
  const [measure] = useSearchOne('Measure', { url: report?.measure });

  if (!report) {
    return null;
  }

  return (
    <Box>
      {measure && <MeasureTitle measure={measure} />}
      <SimpleGrid cols={{ base: 3, sm: 1 }} spacing={{ base: 'md', sm: 'sm' }}>
        {report.group?.map((group: MeasureReportGroup, idx: number) => (
          <MeasureReportGroupDisplay key={group.id ?? idx} group={group} />
        ))}
      </SimpleGrid>
    </Box>
  );
}
