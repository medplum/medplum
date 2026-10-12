// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { PropertyType } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX } from 'react';
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
    const medplum = new MockClient();
    const onError = vi.fn();
    const resource: Patient = { resourceType: 'Patient', birthDate: 'not a date' };
    const renderUi = (): JSX.Element => (
      <MedplumProvider medplum={medplum} onError={onError}>
        <div data-testid="display">
          <FhirPathDisplay
            resource={resource}
            path="between(birthDate, now(), 'years')"
            propertyType={PropertyType.Quantity}
          />
        </div>
      </MedplumProvider>
    );

    const { rerender } = render(renderUi());
    expect(screen.getByTestId('display')).toBeEmptyDOMElement();
    expect(onError).toHaveBeenCalledExactlyOnceWith(expect.any(Error), { source: 'FhirPathDisplay' });

    // Re-rendering with the same path and resource does not report the error again
    rerender(renderUi());
    expect(onError).toHaveBeenCalledTimes(1);

    // Each render re-evaluates, so fixing the resource in place takes effect
    resource.birthDate = '2000-01-01';
    rerender(renderUi());
    expect(screen.getByTestId('display')).not.toBeEmptyDOMElement();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
