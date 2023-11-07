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
  // Relies on window.matchMedia(), will return false if not available https://mantine.dev/hooks/use-media-query/
  const isMobile = useMediaQuery(`(max-width: ${em(750)})`);
  const report = useResource(props.measureReport);
  const [measure] = useSearchOne('Measure', { url: report?.measure });

  if (!report) {
    return null;
  }

  return (
    <Box>
      {measure && <MeasureTitle measure={measure} />}
      <SimpleGrid cols={!isMobile ? 3 : 1} spacing={'xs'}>
        {report.group?.map((group: MeasureReportGroup, idx: number) => (
          <MeasureReportGroupDisplay key={group.id ?? idx} group={group} />
        ))}
      </SimpleGrid>
    </Box>
  );
}
