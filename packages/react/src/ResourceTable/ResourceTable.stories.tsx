import { HomerObservation1, HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import {
  Covid19NasalSpecimen,
  Covid19PCRObservationDefinition,
  Covid19PCRTest,
  Covid19ReviewReport,
} from '../stories/covid19';
import { ResourceTable } from './ResourceTable';

export default {
  title: 'Medplum/ResourceTable',
  component: ResourceTable,
} as Meta;

export const Patient = (): JSX.Element => (
  <Document>
    <ResourceTable value={HomerSimpson} />
  </Document>
);

export const Observation = (): JSX.Element => (
  <Document>
    <ResourceTable value={HomerObservation1} />
  </Document>
);

export const ObservationIgnoreEmpty = (): JSX.Element => (
  <Document>
    <ResourceTable value={HomerObservation1} ignoreMissingValues={true} />
  </Document>
);

export const Covid19PCRTestActivity = (): JSX.Element => (
  <Document>
    <ResourceTable value={Covid19PCRTest} ignoreMissingValues={true} />
  </Document>
);

export const Covid19ReviewReportActivity = (): JSX.Element => (
  <Document>
    <ResourceTable value={Covid19ReviewReport} ignoreMissingValues={true} />
  </Document>
);

export const Covid19SpecimenRequirement = (): JSX.Element => (
  <Document>
    <ResourceTable value={Covid19NasalSpecimen} ignoreMissingValues={true} />
  </Document>
);

export const Covid19ObservationDefinition = (): JSX.Element => (
  <Document>
    <ResourceTable value={Covid19PCRObservationDefinition} ignoreMissingValues={true} />
  </Document>
);
