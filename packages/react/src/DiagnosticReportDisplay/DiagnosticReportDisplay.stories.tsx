import { createReference, deepClone } from '@medplum/core';
import { Observation, Reference, Specimen } from '@medplum/fhirtypes';
import { HomerDiagnosticReport } from '@medplum/mock';
import { Meta } from '@storybook/react';
import React, { useEffect, useState } from 'react';
import { Document } from '../Document/Document';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { CreatinineObservation, ExampleReport } from '../stories/referenceLab';
import { DiagnosticReportDisplay } from './DiagnosticReportDisplay';
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

export const MultipleSpecimens = (): JSX.Element => {
  const report = deepClone(HomerDiagnosticReport);
  report.specimen = [HomerDiagnosticReport.specimen?.[0], HomerDiagnosticReport.specimen?.[0]] as Reference<Specimen>[];

  return (
    <Document>
      <DiagnosticReportDisplay value={report} />
    </Document>
  );
};

export const HideSpecimenInfo = (): JSX.Element => {
  return (
    <Document>
      <DiagnosticReportDisplay hideSpecimenInfo value={HomerDiagnosticReport} />
    </Document>
  );
};

export const HideNotes = (): JSX.Element => {
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async (): Promise<boolean> => {
      const obs = await medplum.createResource({ ...CreatinineObservation, category: undefined });
      (HomerDiagnosticReport.result as Reference<Observation>[]).push(createReference(obs));

      await medplum.updateResource(HomerDiagnosticReport);
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
      <DiagnosticReportDisplay hideObservationNotes value={HomerDiagnosticReport} />
    </Document>
  );
};
