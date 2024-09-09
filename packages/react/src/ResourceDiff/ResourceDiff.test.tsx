import { Patient } from '@medplum/fhirtypes';
import { render, screen } from '../test-utils/render';
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
    expect(removed).toHaveClass('removed');

    const added = screen.getByText('"active": true');
    expect(added).toBeDefined();
    expect(added).toHaveClass('added');
  });
});
