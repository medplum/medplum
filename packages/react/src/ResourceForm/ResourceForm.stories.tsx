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
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { MedplumClient, RequestProfileSchemaOptions, deepClone, loadDataType } from '@medplum/core';
import { AccessPolicy, OperationOutcome, Resource, StructureDefinition } from '@medplum/fhirtypes';

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

function useFakeGetAccessPolicy(medplum: MedplumClient, accessPolicy: AccessPolicy): void {
  useLayoutEffect(() => {
    const realGetAccessPolicy = medplum.getAccessPolicy;
    function fakeGetAccessPolicy(): AccessPolicy {
      console.log('Fake medplum.getAccessPolicy invoked');
      return accessPolicy;
    }

    medplum.getAccessPolicy = fakeGetAccessPolicy;

    return () => {
      medplum.getAccessPolicy = realGetAccessPolicy;
    };
  }, [medplum, accessPolicy]);
}

export const PartiallyReadonlyPatient = (): JSX.Element => {
  const medplum = useMedplum();
  const accessPolicy = useMemo<AccessPolicy>(
    () => ({
      resourceType: 'AccessPolicy',
      resource: [
        {
          resourceType: 'Patient',
          readonlyFields: ['identifier', 'name.given', 'name.family', 'telecom', 'birthDate', 'link', 'contact'],
        },
      ],
    }),
    []
  );
  const resource = {
    ...HomerSimpson,
    telecom: undefined,
  };
  useFakeGetAccessPolicy(medplum, accessPolicy);
  return (
    <Document>
      <ResourceForm
        defaultValue={resource}
        onSubmit={(formData: Resource) => {
          console.log('submit', formData);
        }}
      />
    </Document>
  );
};

export const PartiallyHiddenPatient = (): JSX.Element => {
  const medplum = useMedplum();
  const accessPolicy = useMemo<AccessPolicy>(
    () => ({
      resourceType: 'AccessPolicy',
      resource: [
        {
          resourceType: 'Patient',
          hiddenFields: ['identifier', 'name.use', 'name.prefix', 'name.suffix', 'birthDate', 'link', 'contact'],
        },
      ],
    }),
    []
  );
  useFakeGetAccessPolicy(medplum, accessPolicy);
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

export const USCorePatientExtensionReadonly = (): JSX.Element => {
  const medplum = useMedplum();
  useFakeRequestProfileSchema(medplum);
  const { loaded } = useUSCoreDataTypes({ medplum });
  const profileSD = useUSCoreProfile('USCorePatientProfile');

  const homerSimpsonUSCorePatient = useMemo(() => {
    const patient = deepClone(HomerSimpsonUSCorePatient);

    if (patient.extension?.length) {
      for (const urlFragment of ['genderIdentity', 'birthsex']) {
        const idx = patient.extension?.findIndex((ext) => ext.url.includes(urlFragment));
        if (idx !== -1) {
          patient.extension.splice(idx, 1);
        }
      }
    }

    return patient;
  }, []);
  const accessPolicy = useMemo<AccessPolicy>(
    () => ({
      resourceType: 'AccessPolicy',
      resource: [
        {
          resourceType: 'Patient',
          readonlyFields: ['extension', 'active'],
        },
      ],
    }),
    []
  );
  useFakeGetAccessPolicy(medplum, accessPolicy);

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

export const USCorePatientIssues = (): JSX.Element => {
  const medplum = useMedplum();
  useFakeRequestProfileSchema(medplum);
  const { loaded } = useUSCoreDataTypes({ medplum });
  const profileSD = useUSCoreProfile('USCorePatientProfile');

  const defaultValue: Resource = {
    resourceType: 'Patient',
    name: [
      {
        prefix: ['Sir'],
        given: ['Matt'],
      },
      {
        prefix: ['Doctor'],
      },
    ],
    identifier: [
      {
        system: 'http://identifiers.io',
        value: 'matt',
      },
      {
        value: 'value-without-system',
      },
    ],
    telecom: [
      {
        system: 'phone',
      },
      {
        value: 'matt@example.com',
      },
    ],
    meta: {
      profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'],
    },
    link: [
      {
        other: {
          reference: 'Patient/123',
        },
      } as any,
      {
        other: {
          reference: 'Patient/123',
        },
        type: 'seealso',
      },
    ],
  };

  const outcome: OperationOutcome = {
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity: 'error',
        code: 'structure',
        details: {
          text: 'Missing required property',
        },
        expression: ['Patient.link[0].type'],
      },

      {
        severity: 'error',
        code: 'structure',
        details: {
          text: 'Missing required property',
        },
        expression: ['Patient.identifier[1].system'],
      },
      {
        severity: 'error',
        code: 'structure',
        details: {
          text: 'Missing required property',
        },
        expression: ['Patient.gender'],
      },
      {
        severity: 'error',
        code: 'structure',
        details: {
          text: 'Missing required property',
        },
        expression: ['Patient.telecom[1].system'],
      },
      {
        severity: 'error',
        code: 'structure',
        details: {
          text: 'Missing required property',
        },
        expression: ['Patient.telecom[0].value'],
      },
    ],
  };

  if (!loaded) {
    return <div>Loading...</div>;
  }

  return (
    <Document>
      <ResourceForm
        defaultValue={defaultValue}
        outcome={outcome}
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
  useFakeRequestProfileSchema(medplum);
  const { loaded } = useUSCoreDataTypes({ medplum });
  const profileSD = useUSCoreProfile('USCoreImplantableDeviceProfile');

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
