import { HTTP_HL7_ORG, createReference, loadDataType } from '@medplum/core';
import { Observation, Patient, Specimen, StructureDefinition } from '@medplum/fhirtypes';
import { HomerObservation1, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { convertIsoToLocal, convertLocalToIso } from '../DateTimeInput/DateTimeInput.utils';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import { ResourceForm, ResourceFormProps } from './ResourceForm';
import { readJson } from '@medplum/definitions';

const medplum = new MockClient();

describe('ResourceForm', () => {
  let USCoreStructureDefinitions: StructureDefinition[];
  beforeAll(() => {
    USCoreStructureDefinitions = readJson('fhir/r4/testing/uscore-v5.0.1-structuredefinitions.json');
  });

  async function setup(props: ResourceFormProps, medplumClient?: MockClient): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplumClient ?? medplum}>
          <ResourceForm {...props} />
        </MedplumProvider>
      );
    });
  }

  test('Error on missing resource type', async () => {
    const onSubmit = jest.fn();

    await setup({
      defaultValue: {},
      onSubmit,
    });
  });

  test('Renders empty Practitioner form', async () => {
    const onSubmit = jest.fn();

    await setup({
      defaultValue: {
        resourceType: 'Practitioner',
      },
      onSubmit,
    });

    await waitFor(() => screen.getByText('Resource Type'));

    const control = screen.getByText('Resource Type');
    expect(control).toBeDefined();
  });

  test('Renders Practitioner resource', async () => {
    const onSubmit = jest.fn();

    await setup({
      defaultValue: {
        reference: 'Practitioner/123',
      },
      onSubmit,
    });

    await waitFor(() => screen.getByText('Resource Type'));

    const control = screen.getByText('Resource Type');
    expect(control).toBeDefined();
  });

  test('Submit Practitioner', async () => {
    const onSubmit = jest.fn();

    await setup({
      defaultValue: {
        resourceType: 'Practitioner',
      },
      onSubmit,
    });

    await waitFor(() => screen.getByText('Resource Type'));

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toHaveBeenCalled();
  });

  test('Renders empty Observation form', async () => {
    const onSubmit = jest.fn();

    await setup({
      defaultValue: {
        resourceType: 'Observation',
      } as Observation,
      onSubmit,
    });

    await waitFor(() => screen.getByText('Resource Type'));

    const control = screen.getByText('Resource Type');
    expect(control).toBeDefined();
  });

  test('Renders Observation resource', async () => {
    const onSubmit = jest.fn();

    await setup({
      defaultValue: createReference(HomerObservation1),
      onSubmit,
    });

    await waitFor(() => screen.getByText('Resource Type'));

    const control = screen.getByText('Resource Type');
    expect(control).toBeDefined();
  });

  test('Submit Observation', async () => {
    await medplum.requestSchema('Observation');

    const onSubmit = jest.fn();

    await setup({
      defaultValue: {
        resourceType: 'Observation',
        valueQuantity: {
          value: 1,
          unit: 'kg',
        },
      } as Observation,
      onSubmit,
    });

    await waitFor(() => screen.getByText('Resource Type'));

    // Change the value[x] from Quantity to string
    // and set a value
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Quantity'), {
        target: { value: 'string' },
      });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('value[x]'), {
        target: { value: 'hello' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toHaveBeenCalled();

    const result = onSubmit.mock.calls[0][0];
    expect(result.resourceType).toBe('Observation');
    expect(result.valueQuantity).toBeUndefined();
    expect(result.valueString).toBe('hello');
  });

  test('Delete', async () => {
    const onSubmit = jest.fn();
    const onDelete = jest.fn();

    await setup({
      defaultValue: {
        resourceType: 'Practitioner',
        id: 'xyz',
      },
      onSubmit,
      onDelete,
    });

    expect(screen.getByText('Delete')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
  });

  test('Change Specimen.collection.collectedDateTime', async () => {
    const date = new Date();
    date.setMilliseconds(0); // datetime-local does not support milliseconds
    const localString = convertIsoToLocal(date.toISOString());
    const isoString = convertLocalToIso(localString);
    const onSubmit = jest.fn();

    await setup({ defaultValue: { resourceType: 'Specimen' }, onSubmit });

    await waitFor(() => screen.getByText('Resource Type'));

    await act(async () => {
      fireEvent.change(screen.getByTestId('collected[x]'), { target: { value: localString } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toHaveBeenCalled();

    const result = onSubmit.mock.calls[0][0] as Specimen;
    expect(result.resourceType).toBe('Specimen');
    expect(result.collection).toBeDefined();
    expect(result.collection?.collectedDateTime).toBe(isoString);
  });

  test('Change boolean', async () => {
    const onSubmit = jest.fn();

    await setup({ defaultValue: { resourceType: 'Patient' }, onSubmit });

    await waitFor(() => screen.getByText('Resource Type'));

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Active'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toHaveBeenCalled();

    const patient = onSubmit.mock.calls[0][0] as Patient;
    expect(patient.resourceType).toBe('Patient');
    expect(patient.active).toBe(true);
  });

  test('With profileUrl specified', async () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-implantable-device`;
    const profilesToLoad = [profileUrl, `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-patient`];
    for (const url of profilesToLoad) {
      const sd = USCoreStructureDefinitions.find((sd) => sd.url === url);
      if (!sd) {
        fail(`could not find structure definition for ${url}`);
      }
      loadDataType(sd, sd.url);
    }

    const onSubmit = jest.fn();

    const mockedMedplum = new MockClient();
    const fakeRequestProfileSchema = jest.fn(async (profileUrl: string) => {
      return [profileUrl];
    });
    mockedMedplum.requestProfileSchema = fakeRequestProfileSchema;
    await setup({ defaultValue: { resourceType: 'Device' }, profileUrl, onSubmit }, mockedMedplum);

    expect(fakeRequestProfileSchema).toHaveBeenCalledTimes(1);
  });
});
