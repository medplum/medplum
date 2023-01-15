import { HomerDiagnosticReport } from '@medplum/mock';
import { Meta } from '@storybook/react';
import React, { useEffect, useState } from 'react';
import { DiagnosticReportDisplay } from './DiagnosticReportDisplay';
import { Document } from '../Document/Document';
import { CreatinineObservation, ExampleReport } from '../stories/referenceLab';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { createReference } from '@medplum/core';
export default {
  title: 'Medplum/DiagnosticReportDisplay',
  component: DiagnosticReportDisplay,
} as Meta;

export const Simple = (): JSX.Element => (
  <Document>
    <DiagnosticReportDisplay value={HomerDiagnosticReport} />
  </Document>
);

export const WithCategories = (): JSX.Element => {
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async (): Promise<boolean> => {
      const obs = await medplum.createResource(CreatinineObservation);
      ExampleReport.result = [createReference(obs)];
      await medplum.updateResource(ExampleReport);
      return true;
    })()
      .then(setLoaded)
      .catch(console.log);
  }, [medplum]);

  if (!loaded) {
    return <></>;
  }

  return (
    <Document>
      <DiagnosticReportDisplay value={ExampleReport} />
    </Document>
  );
};
