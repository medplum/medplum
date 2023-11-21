import { Patient } from '@medplum/fhirtypes';
import { render, screen } from '@testing-library/react';
import { ResourceDiff } from './ResourceDiff';

describe('ResourceDiff', () => {
  test('Renders', () => {
    const original: Patient = {
      resourceType: 'Patient',
      birthDate: '1990-01-01',
      active: false,
    };

    const revised: Patient = {
      resourceType: 'Patient',
      birthDate: '1990-01-01',
      active: true,
    };

    render(<ResourceDiff original={original} revised={revised} />);

    const removed = screen.getByText('"active": false');
    expect(removed).toBeDefined();
    expect(removed).toHaveStyle('color: rgb(240, 62, 62);');

    const added = screen.getByText('"active": true');
    expect(added).toBeDefined();
    expect(added).toHaveStyle('color: rgb(55, 178, 77);');
  });
});
