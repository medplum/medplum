import {
  HomerObservation1,
  HomerSimpson,
  HomerSimpsonUSCorePatient,
  USCoreStructureDefinitionList,
} from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import {
  Covid19NasalSpecimen,
  Covid19PCRObservationDefinition,
  Covid19PCRTest,
  Covid19ReviewReport,
} from '../stories/covid19';
import { ResourceTable } from './ResourceTable';
import { MedplumClient, RequestProfileSchemaOptions, deepClone, loadDataType } from '@medplum/core';
import { StructureDefinition } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';

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

function useUSCoreDataTypes({ medplum }: { medplum: MedplumClient }): { loaded: boolean } {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    (async (): Promise<boolean> => {
      for (const sd of USCoreStructureDefinitionList) {
        loadDataType(sd, sd.url);
      }
      return true;
    })()
      .then(setLoaded)
      .catch(console.error);
  }, [medplum]);

  const result = useMemo(() => {
    return { loaded };
  }, [loaded]);

  return result;
}

function useFakeRequestProfileSchema(medplum: MedplumClient): void {
  useLayoutEffect(() => {
    const realRequestProfileSchema = medplum.requestProfileSchema;
    async function fakeRequestProfileSchema(
      profileUrl: string,
      options?: RequestProfileSchemaOptions
    ): Promise<string[]> {
      console.log(
        'Fake medplum.requestProfileSchema invoked but not doing anything; ensure expected profiles are already loaded',
        profileUrl,
        options
      );
      return [profileUrl];
    }

    medplum.requestProfileSchema = fakeRequestProfileSchema;

    return () => {
      medplum.requestProfileSchema = realRequestProfileSchema;
    };
  }, [medplum]);
}

function useUSCoreProfile(profileName: string): StructureDefinition {
  const profileSD = useMemo<StructureDefinition>(() => {
    const result = USCoreStructureDefinitionList.find((sd) => sd.name === profileName);
    if (!result) {
      throw new Error(`Could not find ${profileName}`);
    }
    return result;
  }, [profileName]);

  return profileSD;
}

export const USCorePatient = (): JSX.Element => {
  const medplum = useMedplum();
  useFakeRequestProfileSchema(medplum);
  const { loaded } = useUSCoreDataTypes({ medplum });
  const profileSD = useUSCoreProfile('USCorePatientProfile');

  const homerSimpsonUSCorePatient = useMemo(() => {
    return deepClone(HomerSimpsonUSCorePatient);
  }, []);

  if (!loaded) {
    return <div>Loading...</div>;
  }

  return (
    <Document>
      <ResourceTable value={homerSimpsonUSCorePatient} profileUrl={profileSD.url} ignoreMissingValues />
    </Document>
  );
};
