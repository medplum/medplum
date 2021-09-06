import { Patient } from '.';

describe('Index', () => {

  test('Patient import', () => {
    const patient: Patient = {
      resourceType: 'Patient'
    };
    expect(patient).not.toBeUndefined();
  });
});

