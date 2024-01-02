import {
  DrAliceSmith,
  HomerSimpson,
  HomerSimpsonUSCorePatient,
  ImplantableDeviceKnee,
  TestOrganization,
  USCoreStructureDefinitionList,
} from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ResourceForm } from './ResourceForm';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { MedplumClient, deepClone, loadDataType } from '@medplum/core';
import { StructureDefinition } from '@medplum/fhirtypes';

export default {
  title: 'Medplum/ResourceForm',
  component: ResourceForm,
} as Meta;

export const Patient = (): JSX.Element => (
  <Document>
    <ResourceForm
      defaultValue={HomerSimpson}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const Organization = (): JSX.Element => (
  <Document>
    <ResourceForm
      defaultValue={TestOrganization}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const Practitioner = (): JSX.Element => (
  <Document>
    <ResourceForm
      defaultValue={DrAliceSmith}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const ServiceRequest = (): JSX.Element => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'ServiceRequest',
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const DiagnosticReport = (): JSX.Element => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'DiagnosticReport',
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const DiagnosticReportIssues = (): JSX.Element => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'DiagnosticReport',
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
      outcome={{
        resourceType: 'OperationOutcome',
        id: 'dabf3927-a936-427e-9320-2ff98b8bea46',
        issue: [
          {
            severity: 'error',
            code: 'structure',
            details: {
              text: 'Missing required property "code"',
            },
            expression: ['code'],
          },
        ],
      }}
    />
  </Document>
);

export const Observation = (): JSX.Element => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'Observation',
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const Questionnaire = (): JSX.Element => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'Questionnaire',
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
      onDelete={(formData: any) => {
        console.log('delete', formData);
      }}
    />
  </Document>
);

export const Specimen = (): JSX.Element => (
  <Document>
    <ResourceForm
      defaultValue={{
        resourceType: 'Specimen',
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

function useUSCoreDataTypes({ medplum }: { medplum: MedplumClient }): { loaded: boolean } {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    (async (): Promise<boolean> => {
      for (const sd of USCoreStructureDefinitionList as StructureDefinition[]) {
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

function useProfile(profileName: string): StructureDefinition {
  const profileSD = useMemo<StructureDefinition>(() => {
    const result = (USCoreStructureDefinitionList as StructureDefinition[]).find((sd) => sd.name === profileName);
    if (!result) {
      throw new Error(`Could not find ${profileName}`);
    }
    return result;
  }, [profileName]);

  return profileSD;
}

export const USCorePatient = (): JSX.Element => {
  const medplum = useMedplum();
  const { loaded } = useUSCoreDataTypes({ medplum });
  const profileSD = useProfile('USCorePatientProfile');

  const homerSimpsonUSCorePatient = useMemo(() => {
    return deepClone(HomerSimpsonUSCorePatient);
  }, []);

  if (!loaded) {
    return <div>Loading...</div>;
  }

  return (
    <Document>
      <ResourceForm
        defaultValue={homerSimpsonUSCorePatient}
        onSubmit={(formData: any) => {
          console.log('submit', formData);
        }}
        profileUrl={profileSD.url}
      />
    </Document>
  );
};

export const USCoreImplantableDevice = (): JSX.Element => {
  const medplum = useMedplum();
  const { loaded } = useUSCoreDataTypes({ medplum });
  const profileSD = useProfile('USCoreImplantableDeviceProfile');

  const implantedKnee = useMemo(() => {
    return deepClone(ImplantableDeviceKnee);
  }, []);

  if (!loaded) {
    return <div>Loading...</div>;
  }

  return (
    <Document>
      <ResourceForm
        defaultValue={implantedKnee}
        onSubmit={(formData: any) => {
          console.log('submit', formData);
        }}
        profileUrl={profileSD.url}
      />
    </Document>
  );
};
