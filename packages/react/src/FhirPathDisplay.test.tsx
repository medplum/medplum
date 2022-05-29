import { PropertyType } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { FhirPathDisplay } from './FhirPathDisplay';

describe('FhirPathDisplay', () => {
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
});
