import {
  DrAliceSmith,
  HomerSimpson,
  TestOrganization,
  USCoreBirthSexExtension,
  USCoreEthnicityExtension,
  USCoreGenderIdentityExtension,
  USCorePatientProfile,
  USCoreRaceExtension,
} from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ResourceForm } from './ResourceForm';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { deepClone, indexStructureDefinitionBundle } from '@medplum/core';

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
  useEffect(() => {
    (async (): Promise<boolean> => {
      const sd = await medplum.createResource(USCorePatientProfile);
      indexStructureDefinitionBundle([sd], sd.url);
      [USCoreRaceExtension, USCoreEthnicityExtension, USCoreBirthSexExtension, USCoreGenderIdentityExtension].forEach(
        (ext) => {
          indexStructureDefinitionBundle([ext], ext.url);
        }
      );
      // await medplum.createResource(FishPatientResources.getBlinkyTheFish());
      // await medplum.createResource(FishPatientResources.getSampleFishPatient());
      return true;
    })()
      .then(setLoaded)
      .catch(console.error);
  }, [medplum]);

  const HomerSimpsonWithExtensions = useMemo(() => {
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
          {
            valueCoding: {
              system: 'http://terminology.hl7.org/CodeSystem/v3-NullFlavor',
              code: 'OTH',
              display: 'other',
            },
            url: 'detailed',
          },
          {
            valueString: 'A text description',
            url: 'text',
          },
        ],
        url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
      },
      {
        extension: [
          {
            valueCoding: {
              system: 'urn:oid:2.16.840.1.113883.6.238',
              code: '2135-2',
              display: 'Hispanic or Latino',
            },
            url: 'ombCategory',
          },
          {
            valueCoding: {
              system: 'urn:oid:2.16.840.1.113883.6.238',
              code: '2138-6',
              display: 'Andalusian',
            },
            url: 'detailed',
          },
          {
            valueString: 'This is an ethnicity description',
            url: 'text',
          },
        ],
        url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
      },
      {
        extension: [
          {
            valueCodeableConcept: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/v3-TribalEntityUS',
                  code: '104',
                  display: 'Hopi Tribe of Arizona',
                },
              ],
            },
            url: 'tribalAffiliation',
          },
          {
            valueBoolean: true,
            url: 'isEnrolled',
          },
        ],
        url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-tribal-affiliation',
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
        defaultValue={HomerSimpsonWithExtensions}
        onSubmit={(formData: any) => {
          console.log('submit', formData);
        }}
        profileUrl={USCorePatientProfile.url}
      />
    </Document>
  );
};
