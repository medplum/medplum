import { Box, SimpleGrid, em } from '@mantine/core';
import { MeasureReport, MeasureReportGroup, Reference } from '@medplum/fhirtypes';
import { useResource, useSearchOne } from '@medplum/react-hooks';
import React from 'react';
import { MeasureReportGroupDisplay, MeasureTitle } from './MeasureReportGroup/MeasureReportGroup';
import { useMediaQuery } from '@mantine/hooks';

export interface MeasureReportDisplayProps {
  readonly measureReport: MeasureReport | Reference<MeasureReport>;
}

export function MeasureReportDisplay(props: MeasureReportDisplayProps): JSX.Element | null {
  const report = useResource(props.measureReport);
  const isMobile = useMediaQuery(`(max-width: ${em(750)})`);
  const [measure] = useSearchOne('Measure', { url: report?.measure });

  if (!report) {
    return null;
  }

  return (
    <Box>
      {measure && <MeasureTitle measure={measure} />}
      <SimpleGrid cols={isMobile ? 1 : 3} spacing={'xs'}>
        {report.group?.map((group: MeasureReportGroup, idx: number) => (
          <MeasureReportGroupDisplay key={group.id ?? idx} group={group} />
        ))}
      </SimpleGrid>
    </Box>
  );
}
