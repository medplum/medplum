import {
  DrAliceSmith,
  HomerSimpson,
  HomerSimpsonUSCorePatient,
  ImplantableDeviceKnee,
  TestOrganization,
  USCoreStructureDefinitionList,
} from '@medplum/mock';
import { Meta, StoryObj } from '@storybook/react';
import { Document } from '../Document/Document';
import { ResourceForm } from './ResourceForm';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { MedplumClient, deepClone, loadDataType } from '@medplum/core';
import { StructureDefinition } from '@medplum/fhirtypes';
import { withMockedGQL } from '../stories/decorators';

export default {
  title: 'Medplum/ResourceForm',
  component: ResourceForm,
} as Meta;

type Story = StoryObj<typeof ResourceForm>;

export const Patient: Story = {
  decorators: [
    withMockedGQL([
      {
        query:
          '{ StructureDefinitionList(name: "Patient") { resourceType, name, kind, description, type, snapshot { element { id, path, definition, min, max, base { path, min, max }, contentReference, type { code, profile, targetProfile }, binding { strength, valueSet } } } } SearchParameterList(base: "Patient", _count: 100) { base, code, type, expression, target } }',
        response: {
          data: {
            SearchParameterList: [],
            StructureDefinitionList: [
              {
                name: 'Patient',
                type: 'Patient',
                kind: 'resource',
                elements: {
                  id: {
                    description: '',
                    path: 'Patient.id',
                    min: 0,
                    max: 1,
                    isArray: false,
                    constraints: [],
                    type: [
                      {
                        code: 'http://hl7.org/fhirpath/System.String',
                      },
                    ],
                  },
                  meta: {
                    description: '',
                    path: 'Patient.meta',
                    min: 0,
                    max: 1,
                    isArray: false,
                    constraints: [],
                    type: [
                      {
                        code: 'Meta',
                      },
                    ],
                  },
                  implicitRules: {
                    description: '',
                    path: 'Patient.implicitRules',
                    min: 0,
                    max: 1,
                    isArray: false,
                    constraints: [],
                    type: [
                      {
                        code: 'uri',
                      },
                    ],
                  },
                  language: {
                    description: '',
                    path: 'Patient.language',
                    min: 0,
                    max: 1,
                    isArray: false,
                    constraints: [],
                    type: [
                      {
                        code: 'code',
                      },
                    ],
                  },
                  text: {
                    description: '',
                    path: 'Patient.text',
                    min: 0,
                    max: 1,
                    isArray: false,
                    constraints: [],
                    type: [
                      {
                        code: 'Narrative',
                      },
                    ],
                  },
                  contained: {
                    description: '',
                    path: 'Patient.contained',
                    min: 0,
                    max: null,
                    isArray: true,
                    constraints: [],
                    type: [
                      {
                        code: 'Resource',
                      },
                    ],
                  },
                  extension: {
                    description: '',
                    path: 'Patient.extension',
                    min: 0,
                    max: null,
                    isArray: true,
                    constraints: [],
                    type: [
                      {
                        code: 'Extension',
                      },
                    ],
                  },
                  modifierExtension: {
                    description: '',
                    path: 'Patient.modifierExtension',
                    min: 0,
                    max: null,
                    isArray: true,
                    constraints: [],
                    type: [
                      {
                        code: 'Extension',
                      },
                    ],
                  },
                  identifier: {
                    description: '',
                    path: 'Patient.identifier',
                    min: 0,
                    max: null,
                    isArray: true,
                    constraints: [],
                    type: [
                      {
                        code: 'Identifier',
                      },
                    ],
                  },
                  active: {
                    description: '',
                    path: 'Patient.active',
                    min: 0,
                    max: 1,
                    isArray: false,
                    constraints: [],
                    type: [
                      {
                        code: 'boolean',
                      },
                    ],
                  },
                  name: {
                    description: '',
                    path: 'Patient.name',
                    min: 0,
                    max: null,
                    isArray: true,
                    constraints: [],
                    type: [
                      {
                        code: 'HumanName',
                      },
                    ],
                  },
                  telecom: {
                    description: '',
                    path: 'Patient.telecom',
                    min: 0,
                    max: null,
                    isArray: true,
                    constraints: [],
                    type: [
                      {
                        code: 'ContactPoint',
                      },
                    ],
                  },
                  gender: {
                    description: '',
                    path: 'Patient.gender',
                    min: 0,
                    max: 1,
                    isArray: false,
                    constraints: [],
                    type: [
                      {
                        code: 'code',
                      },
                    ],
                  },
                  birthDate: {
                    description: '',
                    path: 'Patient.birthDate',
                    min: 0,
                    max: 1,
                    isArray: false,
                    constraints: [],
                    type: [
                      {
                        code: 'date',
                      },
                    ],
                  },
                  'deceased[x]': {
                    description: '',
                    path: 'Patient.deceased[x]',
                    min: 0,
                    max: 1,
                    isArray: false,
                    constraints: [],
                    type: [
                      {
                        code: 'boolean',
                      },
                      {
                        code: 'dateTime',
                      },
                    ],
                  },
                  address: {
                    description: '',
                    path: 'Patient.address',
                    min: 0,
                    max: null,
                    isArray: true,
                    constraints: [],
                    type: [
                      {
                        code: 'Address',
                      },
                    ],
                  },
                  maritalStatus: {
                    description: '',
                    path: 'Patient.maritalStatus',
                    min: 0,
                    max: 1,
                    isArray: false,
                    constraints: [],
                    type: [
                      {
                        code: 'CodeableConcept',
                      },
                    ],
                  },
                  'multipleBirth[x]': {
                    description: '',
                    path: 'Patient.multipleBirth[x]',
                    min: 0,
                    max: 1,
                    isArray: false,
                    constraints: [],
                    type: [
                      {
                        code: 'boolean',
                      },
                      {
                        code: 'integer',
                      },
                    ],
                  },
                  photo: {
                    description: '',
                    path: 'Patient.photo',
                    min: 0,
                    max: null,
                    isArray: true,
                    constraints: [],
                    type: [
                      {
                        code: 'Attachment',
                      },
                    ],
                  },
                  contact: {
                    description: '',
                    path: 'Patient.contact',
                    min: 0,
                    max: null,
                    isArray: true,
                    constraints: [],
                    type: [
                      {
                        code: 'PatientContact',
                      },
                    ],
                  },
                  communication: {
                    description: '',
                    path: 'Patient.communication',
                    min: 0,
                    max: null,
                    isArray: true,
                    constraints: [],
                    type: [
                      {
                        code: 'PatientCommunication',
                      },
                    ],
                  },
                  generalPractitioner: {
                    description: '',
                    path: 'Patient.generalPractitioner',
                    min: 0,
                    max: null,
                    isArray: true,
                    constraints: [],
                    type: [
                      {
                        code: 'Reference',
                        targetProfile: [
                          'http://hl7.org/fhir/StructureDefinition/Organization',
                          'http://hl7.org/fhir/StructureDefinition/Practitioner',
                          'http://hl7.org/fhir/StructureDefinition/PractitionerRole',
                        ],
                      },
                    ],
                  },
                  managingOrganization: {
                    description: '',
                    path: 'Patient.managingOrganization',
                    min: 0,
                    max: 1,
                    isArray: false,
                    constraints: [],
                    type: [
                      {
                        code: 'Reference',
                        targetProfile: ['http://hl7.org/fhir/StructureDefinition/Organization'],
                      },
                    ],
                  },
                  link: {
                    description: '',
                    path: 'Patient.link',
                    min: 0,
                    max: null,
                    isArray: true,
                    constraints: [],
                    type: [
                      {
                        code: 'PatientLink',
                      },
                    ],
                  },
                },
                constraints: [],
                innerTypes: [
                  {
                    name: 'PatientContact',
                    elements: {
                      id: {
                        description: '',
                        path: 'Patient.contact.id',
                        min: 0,
                        max: 1,
                        isArray: false,
                        constraints: [],
                        type: [
                          {
                            code: 'http://hl7.org/fhirpath/System.String',
                          },
                        ],
                      },
                      extension: {
                        description: '',
                        path: 'Patient.contact.extension',
                        min: 0,
                        max: null,
                        isArray: true,
                        constraints: [],
                        type: [
                          {
                            code: 'Extension',
                          },
                        ],
                      },
                      modifierExtension: {
                        description: '',
                        path: 'Patient.contact.modifierExtension',
                        min: 0,
                        max: null,
                        isArray: true,
                        constraints: [],
                        type: [
                          {
                            code: 'Extension',
                          },
                        ],
                      },
                      relationship: {
                        description: '',
                        path: 'Patient.contact.relationship',
                        min: 0,
                        max: null,
                        isArray: true,
                        constraints: [],
                        type: [
                          {
                            code: 'CodeableConcept',
                          },
                        ],
                      },
                      name: {
                        description: '',
                        path: 'Patient.contact.name',
                        min: 0,
                        max: 1,
                        isArray: false,
                        constraints: [],
                        type: [
                          {
                            code: 'HumanName',
                          },
                        ],
                      },
                      telecom: {
                        description: '',
                        path: 'Patient.contact.telecom',
                        min: 0,
                        max: null,
                        isArray: true,
                        constraints: [],
                        type: [
                          {
                            code: 'ContactPoint',
                          },
                        ],
                      },
                      address: {
                        description: '',
                        path: 'Patient.contact.address',
                        min: 0,
                        max: 1,
                        isArray: false,
                        constraints: [],
                        type: [
                          {
                            code: 'Address',
                          },
                        ],
                      },
                      gender: {
                        description: '',
                        path: 'Patient.contact.gender',
                        min: 0,
                        max: 1,
                        isArray: false,
                        constraints: [],
                        type: [
                          {
                            code: 'code',
                          },
                        ],
                      },
                      organization: {
                        description: '',
                        path: 'Patient.contact.organization',
                        min: 0,
                        max: 1,
                        isArray: false,
                        constraints: [],
                        type: [
                          {
                            code: 'Reference',
                            targetProfile: ['http://hl7.org/fhir/StructureDefinition/Organization'],
                          },
                        ],
                      },
                      period: {
                        description: '',
                        path: 'Patient.contact.period',
                        min: 0,
                        max: 1,
                        isArray: false,
                        constraints: [],
                        type: [
                          {
                            code: 'Period',
                          },
                        ],
                      },
                    },
                    constraints: [],
                    innerTypes: [],
                  },
                  {
                    name: 'PatientCommunication',
                    elements: {
                      id: {
                        description: '',
                        path: 'Patient.communication.id',
                        min: 0,
                        max: 1,
                        isArray: false,
                        constraints: [],
                        type: [
                          {
                            code: 'http://hl7.org/fhirpath/System.String',
                          },
                        ],
                      },
                      extension: {
                        description: '',
                        path: 'Patient.communication.extension',
                        min: 0,
                        max: null,
                        isArray: true,
                        constraints: [],
                        type: [
                          {
                            code: 'Extension',
                          },
                        ],
                      },
                      modifierExtension: {
                        description: '',
                        path: 'Patient.communication.modifierExtension',
                        min: 0,
                        max: null,
                        isArray: true,
                        constraints: [],
                        type: [
                          {
                            code: 'Extension',
                          },
                        ],
                      },
                      language: {
                        description: '',
                        path: 'Patient.communication.language',
                        min: 1,
                        max: 1,
                        isArray: false,
                        constraints: [],
                        type: [
                          {
                            code: 'CodeableConcept',
                          },
                        ],
                      },
                      preferred: {
                        description: '',
                        path: 'Patient.communication.preferred',
                        min: 0,
                        max: 1,
                        isArray: false,
                        constraints: [],
                        type: [
                          {
                            code: 'boolean',
                          },
                        ],
                      },
                    },
                    constraints: [],
                    innerTypes: [],
                  },
                  {
                    name: 'PatientLink',
                    elements: {
                      id: {
                        description: '',
                        path: 'Patient.link.id',
                        min: 0,
                        max: 1,
                        isArray: false,
                        constraints: [],
                        type: [
                          {
                            code: 'http://hl7.org/fhirpath/System.String',
                          },
                        ],
                      },
                      extension: {
                        description: '',
                        path: 'Patient.link.extension',
                        min: 0,
                        max: null,
                        isArray: true,
                        constraints: [],
                        type: [
                          {
                            code: 'Extension',
                          },
                        ],
                      },
                      modifierExtension: {
                        description: '',
                        path: 'Patient.link.modifierExtension',
                        min: 0,
                        max: null,
                        isArray: true,
                        constraints: [],
                        type: [
                          {
                            code: 'Extension',
                          },
                        ],
                      },
                      other: {
                        description: '',
                        path: 'Patient.link.other',
                        min: 1,
                        max: 1,
                        isArray: false,
                        constraints: [],
                        type: [
                          {
                            code: 'Reference',
                            targetProfile: [
                              'http://hl7.org/fhir/StructureDefinition/Patient',
                              'http://hl7.org/fhir/StructureDefinition/RelatedPerson',
                            ],
                          },
                        ],
                      },
                      type: {
                        description: '',
                        path: 'Patient.link.type',
                        min: 1,
                        max: 1,
                        isArray: false,
                        constraints: [],
                        type: [
                          {
                            code: 'code',
                          },
                        ],
                      },
                    },
                    constraints: [],
                    innerTypes: [],
                  },
                ],
                summaryProperties: {},
                mandatoryProperties: {},
              },
            ],
          },
        },
      },
    ]),
  ],
  render() {
    return (
      <Document>
        <ResourceForm
          defaultValue={HomerSimpson}
          onSubmit={(formData: any) => {
            console.log('submit', formData);
          }}
        />
      </Document>
    );
  },
};

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
