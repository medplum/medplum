import { HTTP_HL7_ORG, createReference, deepClone, loadDataType } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Observation, OperationOutcome, Patient, Specimen, StructureDefinition } from '@medplum/fhirtypes';
import { HomerObservation1, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { convertIsoToLocal, convertLocalToIso } from '../DateTimeInput/DateTimeInput.utils';
import { act, fireEvent, render, screen, within } from '../test-utils/render';
import { ResourceForm, ResourceFormProps } from './ResourceForm';

const medplum = new MockClient();

describe('ResourceForm', () => {
  let USCoreStructureDefinitions: StructureDefinition[];
  beforeAll(() => {
    USCoreStructureDefinitions = readJson('fhir/r4/testing/uscore-v5.0.1-structuredefinitions.json');
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
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

    expect(await screen.findByText('Resource Type')).toBeInTheDocument();

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

    expect(await screen.findByText('Resource Type')).toBeInTheDocument();

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

    expect(await screen.findByText('Resource Type')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Create'));
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

    expect(await screen.findByText('Resource Type')).toBeInTheDocument();

    const control = screen.getByText('Resource Type');
    expect(control).toBeDefined();
  });

  test('Renders Observation resource', async () => {
    const onSubmit = jest.fn();

    await setup({
      defaultValue: createReference(HomerObservation1),
      onSubmit,
    });

    expect(await screen.findByText('Resource Type')).toBeInTheDocument();

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

    expect(await screen.findByText('Resource Type')).toBeInTheDocument();

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
      fireEvent.click(screen.getByText('Create'));
    });

    expect(onSubmit).toHaveBeenCalled();

    const result = onSubmit.mock.calls[0][0];
    expect(result.resourceType).toBe('Observation');
    expect(result.valueQuantity).toBeUndefined();
    expect(result.valueString).toBe('hello');
  });

  test('Patch', async () => {
    const onSubmit = jest.fn();
    const onPatch = jest.fn();

    await setup({
      defaultValue: {
        resourceType: 'Practitioner',
        id: 'xyz',
      },
      onSubmit,
      onPatch,
    });

    const moreActions = screen.getByLabelText('More actions');
    expect(moreActions).toBeDefined();
    await act(async () => {
      fireEvent.click(moreActions);
    });

    const patchButton = await screen.findByText('Patch');
    expect(patchButton).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(patchButton);
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onPatch).toHaveBeenCalled();
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

    const moreActions = screen.getByLabelText('More actions');
    expect(moreActions).toBeDefined();
    await act(async () => {
      fireEvent.click(moreActions);
    });

    const deleteButton = await screen.findByText('Delete');
    expect(deleteButton).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(deleteButton);
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

    expect(await screen.findByText('Resource Type')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByTestId('collected[x]'), { target: { value: localString } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Create'));
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

    expect(await screen.findByText('Resource Type')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Active'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Create'));
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

  describe('US Core Patient', () => {
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
    const fakeRequestProfileSchema = jest.fn(async (profileUrl: string) => {
      return [profileUrl];
    });
    beforeAll(() => {
      for (const url of profileUrls) {
        const sd = USCoreStructureDefinitions.find((sd) => sd.url === url);
        if (!sd) {
          fail(`could not find structure definition for ${url}`);
        }
        loadDataType(sd, sd.url);
      }
    });

    test('add extensions', async () => {
      const onSubmit = jest.fn();
      const mockedMedplum = new MockClient();
      mockedMedplum.requestProfileSchema = fakeRequestProfileSchema;

      const initialValue: Patient = {
        resourceType: 'Patient',
        name: [
          {
            given: ['Lisa'],
            family: 'Simpson',
            use: 'usual',
          },
        ],
        gender: 'female',
        identifier: [
          {
            system: 'http://name.ly',
            value: 'lisa-123',
          },
        ],
      };
      const expectedValue = deepClone(initialValue);
      expectedValue.extension = [];

      await setup({ defaultValue: initialValue, profileUrl, onSubmit }, mockedMedplum);

      const raceExtension = screen.getByTestId('slice-race');

      await act(async () => {
        fireEvent.click(within(raceExtension).getByText('Add Race'));
      });

      await act(async () => {
        fireEvent.click(within(raceExtension).getByText('Add OMB Category'));
      });

      const ombCategoryInput = within(within(raceExtension).getByTestId('slice-ombCategory')).getByRole('searchbox');

      await act(async () => {
        fireEvent.focus(ombCategoryInput);
      });

      await act(async () => {
        fireEvent.change(ombCategoryInput, { target: { value: 'custom-omb-category-value' } });
      });

      expect(await screen.findByText('+ Create custom-omb-category-value')).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByText('+ Create custom-omb-category-value'));
      });

      expect(await screen.findByText('custom-omb-category-value')).toBeInTheDocument();

      await act(async () => {
        const textInput = within(within(raceExtension).getByTestId('slice-text')).getByTestId('value[x]');
        fireEvent.change(textInput, {
          target: { value: 'This is a text value' },
        });
      });

      // Just clicking add, but not filling in a value should not add it to the final value
      await act(async () => {
        fireEvent.click(within(raceExtension).getByText('Add Detailed'));
      });

      expectedValue.extension.push({
        extension: [
          {
            url: 'ombCategory',
            valueCoding: {
              code: 'custom-omb-category-value',
              display: 'custom-omb-category-value',
            },
          },
          {
            url: 'text',
            valueString: 'This is a text value',
          },
        ],
        url: raceExtensionUrl,
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Create'));
      });

      expect(onSubmit).toHaveBeenCalledWith(expectedValue);
    });

    test('Array-aware error messages on primitive field', async () => {
      const onSubmit = jest.fn();
      const mockedMedplum = new MockClient();
      mockedMedplum.requestProfileSchema = fakeRequestProfileSchema;
      const defaultValue: Patient = {
        resourceType: 'Patient',
        identifier: [{ system: 'http://system.com', value: 'foo' }],
        name: [{ given: ['Matt'] }, { prefix: ['Sir'] }],
        gender: 'male',
        meta: {
          profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'],
        },
        link: [
          { other: { reference: 'Patient/5bf4658e-b598-45a1-b575-a896206ae4e0', display: 'Matt' } } as any,
          {
            other: { reference: 'Patient/5bf4658e-b598-45a1-b575-a896206ae4e0', display: 'Matt' },
            type: 'replaced-by',
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
        ],
      };

      await setup({ defaultValue, profileUrl, onSubmit, outcome }, mockedMedplum);

      const typeInputs = screen.getAllByText('Type');
      expect(typeInputs).toHaveLength(2);

      // Patient.link[0].type has error
      const typeLabel1 = typeInputs[0];
      if (typeLabel1.parentElement === null) {
        fail('typeLabel1.parentElement is null');
      }
      expect(within(typeLabel1.parentElement).queryByText('Missing required property')).toBeInTheDocument();

      // Patient.link[1].type has NO error
      const typeLabel2 = typeInputs[1];
      if (typeLabel2.parentElement === null) {
        fail('typeLabel2.parentElement is null');
      }
      expect(within(typeLabel2.parentElement).queryByText('Missing required property')).not.toBeInTheDocument();
    });
  });
});
