import { indexStructureDefinitionBundle } from '@medplum/core';
import { FishPatientResources } from '@medplum/mock';
import { useMedplum } from '@medplum/react-hooks';
import { Meta } from '@storybook/react';
import { useEffect, useState } from 'react';
import { Document } from '../Document/Document';
import { ReferenceInput } from './ReferenceInput';

export default {
  title: 'Medplum/ReferenceInput',
  component: ReferenceInput,
} as Meta;

export const TargetProfile = (): JSX.Element => (
  <Document>
    <ReferenceInput name="foo" targetTypes={['Practitioner', 'Patient']} />
  </Document>
);

export const FreeText = (): JSX.Element => (
  <Document>
    <ReferenceInput name="foo" />
  </Document>
);

const FishPatientProfileSD = FishPatientResources.getFishPatientProfileSD();

export const PatientProfileAndPatient = (): JSX.Element => {
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    (async (): Promise<boolean> => {
      const sd = await medplum.createResource(FishPatientProfileSD);
      indexStructureDefinitionBundle([sd], sd.url);
      await medplum.createResource(FishPatientResources.getBlinkyTheFish());
      await medplum.createResource(FishPatientResources.getSampleFishPatient());
      return true;
    })()
      .then(setLoaded)
      .catch(console.error);
  }, [medplum]);

  if (!loaded) {
    return <div>Loading...</div>;
  }

  return (
    <Document>
      <ReferenceInput name="foo" targetTypes={[FishPatientProfileSD.url, 'Patient']} />
    </Document>
  );
};

export const DisabledTargetProfile = (): JSX.Element => (
  <Document>
    <ReferenceInput disabled name="foo" targetTypes={['Practitioner', 'Patient']} />
  </Document>
);

export const DisabledFreeText = (): JSX.Element => (
  <Document>
    <ReferenceInput disabled name="foo" />
  </Document>
);
