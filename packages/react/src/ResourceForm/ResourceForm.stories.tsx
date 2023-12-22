import { DrAliceSmith, HomerSimpson, TestOrganization, USCoreStructureDefinitionList } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ResourceForm } from './ResourceForm';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { deepClone, loadDataType } from '@medplum/core';
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

export const USCorePatient = (): JSX.Element => {
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState(false);
  const patientProfileSD = useMemo<StructureDefinition>(() => {
    const result = (USCoreStructureDefinitionList as StructureDefinition[]).find(
      (sd) => sd.name === 'USCorePatientProfile'
    );
    if (!result) {
      throw new Error('Could not find USCorePatientProfile');
    }
    return result;
  }, []);
  useEffect(() => {
    (async (): Promise<boolean> => {
      for (const sd of USCoreStructureDefinitionList as StructureDefinition[]) {
        loadDataType(sd, sd.url);
      }
      return true;
    })()
      .then(setLoaded)
      .catch(console.error);
  }, [medplum, patientProfileSD]);

  const HomerSimpsonUSCorePatient = useMemo(() => {
    const result = deepClone(HomerSimpson);
    result.extension = [
      {
        extension: [
          {
            valueCoding: {
              system: 'urn:oid:2.16.840.1.113883.6.238',
              code: '2106-3',
              display: 'White',
            },
            url: 'ombCategory',
          },
        ],
        url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
      },
      {
        extension: [
          {
            valueCoding: {
              system: 'urn:oid:2.16.840.1.113883.6.238',
              code: '2186-5',
              display: 'Not Hispanic or Latino',
            },
            url: 'ombCategory',
          },
        ],
        url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
      },
      {
        valueCode: 'M',
        url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex',
      },
      {
        valueCode: 'M',
        url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-sex',
      },
      {
        valueCodeableConcept: {
          coding: [
            {
              system: 'urn:oid:2.16.840.1.113762.1.4.1021.32',
              code: 'M',
              display: 'Male',
            },
          ],
        },
        url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-genderIdentity',
      },
    ];

    return result;
  }, []);

  if (!loaded) {
    return <div>Loading...</div>;
  }

  return (
    <Document>
      <ResourceForm
        defaultValue={HomerSimpsonUSCorePatient}
        onSubmit={(formData: any) => {
          console.log('submit', formData);
        }}
        profileUrl={patientProfileSD.url}
      />
    </Document>
  );
};
