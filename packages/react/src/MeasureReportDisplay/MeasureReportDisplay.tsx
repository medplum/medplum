import { Box, SimpleGrid } from '@mantine/core';
import { Measure, MeasureReport, MeasureReportGroup, Reference } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import React, { useEffect } from 'react';
import { MeasureReportDisplayGroup, MeasureTitle } from './MeasureReportGroup/MeasureReportGroup';

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
  }, [medplum, report]);

  if (!report) {
    return null;
  }

  return (
    <Box>
      {measure && <MeasureTitle measure={measure} />}
      <SimpleGrid cols={3} spacing={'xs'}>
        {report.group?.map((group: MeasureReportGroup, idx: number) => <MeasureReportDisplayGroup key={group.id ?? idx} group={group} />)}
      </SimpleGrid>
    </Box>
  );
}
