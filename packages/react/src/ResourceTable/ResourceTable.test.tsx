import { HomerSimpsonUSCorePatient, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, render, screen } from '../test-utils/render';
import { ResourceTable, ResourceTableProps } from './ResourceTable';
import { HTTP_HL7_ORG, loadDataType } from '@medplum/core';
import { StructureDefinition } from '@medplum/fhirtypes';
import { readJson } from '@medplum/definitions';

const medplum = new MockClient();

describe('ResourceTable', () => {
  async function setup(props: ResourceTableProps, client?: MockClient): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={client ?? medplum}>
          <ResourceTable {...props} />
        </MedplumProvider>
      );
    });
  }

  test('Renders empty Practitioner form', async () => {
    await setup({
      value: {
        resourceType: 'Practitioner',
      },
    });

    expect(await screen.findByText('Name')).toBeInTheDocument();

    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  test('Renders Practitioner resource', async () => {
    await setup({
      value: {
        reference: 'Practitioner/123',
      },
    });

    expect(await screen.findByText('Name')).toBeInTheDocument();

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Gender')).toBeInTheDocument();
  });

  test('Ignore missing values', async () => {
    await setup({
      value: {
        reference: 'Practitioner/123',
      },
      ignoreMissingValues: true,
    });

    expect(await screen.findByText('Name')).toBeInTheDocument();

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.queryByText('Gender')).toBeNull();
  });

  test('US Core Patient profile', async () => {
    const USCoreStructureDefinitions = readJson(
      'fhir/r4/testing/uscore-v5.0.1-structuredefinitions.json'
    ) as StructureDefinition[];
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-patient`;
    const raceExtensionUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-race`;
    const ethnicityExtensionUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-ethnicity`;
    const profileUrls = [
      profileUrl,
      raceExtensionUrl,
      ethnicityExtensionUrl,
      `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-birthsex`,
      `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-genderIdentity`,
    ];
    for (const url of profileUrls) {
      const sd = USCoreStructureDefinitions.find((sd) => sd.url === url);
      if (!sd) {
        fail(`could not find structure definition for ${url}`);
      }
      loadDataType(sd, sd.url);
    }

    const mockedMedplum = new MockClient();
    const fakeRequestProfileSchema = jest.fn(async (profileUrl: string) => {
      return [profileUrl];
    });
    mockedMedplum.requestProfileSchema = fakeRequestProfileSchema;

    const value = HomerSimpsonUSCorePatient;
    await setup({ value, profileUrl }, mockedMedplum);

    expect(screen.getByText('Race')).toBeInTheDocument();
    expect(screen.getAllByText('OMB Category')).toHaveLength(2);
    expect(screen.getByText('Ethnicity')).toBeInTheDocument();
    expect(screen.getByText('Not Hispanic or Latino')).toBeInTheDocument();
    expect(screen.getByText('Birthsex')).toBeInTheDocument();
    expect(screen.getByText('Gender Identity')).toBeInTheDocument();
    expect(screen.getByText('Male')).toBeInTheDocument();
  });
});
