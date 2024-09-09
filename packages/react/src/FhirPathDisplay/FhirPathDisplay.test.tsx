import { PropertyType } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { render, screen } from '../test-utils/render';
import { FhirPathDisplay } from './FhirPathDisplay';

describe('FhirPathDisplay', () => {
  beforeAll(async () => {
    await new MockClient().requestSchema('Patient');
  });

  test('Renders single value', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      name: [
        {
          given: ['Alice'],
          family: 'Smith',
        },
      ],
    };

    render(<FhirPathDisplay resource={patient} path="Patient.name.given" propertyType={PropertyType.string} />);
    expect(screen.getByText('Alice')).toBeDefined();
  });

  test('Error on multiple values', () => {
    console.error = jest.fn();
    const patient: Patient = {
      resourceType: 'Patient',
      name: [
        {
          given: ['Alice', 'Ann'],
          family: 'Smith',
        },
      ],
    };
    expect(() =>
      render(<FhirPathDisplay resource={patient} path="Patient.name.given" propertyType={PropertyType.string} />)
    ).toThrow('must resolve to a single element');
    expect(console.error).toHaveBeenCalled();
  });

  test('Handles null name', () => {
    render(
      <FhirPathDisplay
        resource={{
          resourceType: 'Patient',
        }}
        path="Patient.name.given"
        propertyType={PropertyType.string}
      />
    );
  });

  test('Handles malformed date', () => {
    console.warn = jest.fn();
    render(
      <FhirPathDisplay
        resource={{
          resourceType: 'Patient',
          birthDate: 'not a date',
        }}
        path="between(birthDate, now(), 'years')"
        propertyType={PropertyType.string}
      />
    );
    expect(console.warn).toHaveBeenCalledWith('FhirPathDisplay:', expect.any(Error));
  });
});
