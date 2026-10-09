// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedicationRequest } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { usePatientSummaryData } from './usePatientSummaryData';

describe('usePatientSummaryData', () => {
  test('Reports each failed search and still returns the rest', async () => {
    const medplum = new MockClient();
    const onError = vi.fn();
    const conditionError = new Error('Condition search failed');
    const allergyError = new Error('Allergy search failed');
    const medication: MedicationRequest = {
      resourceType: 'MedicationRequest',
      id: 'med-1',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/123' },
    };
    medplum.searchResources = vi.fn().mockImplementation(async (resourceType: string) => {
      if (resourceType === 'Condition') {
        throw conditionError;
      }
      if (resourceType === 'AllergyIntolerance') {
        throw allergyError;
      }
      return [medication];
    });

    const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
      <MedplumProvider medplum={medplum} onError={onError}>
        {children}
      </MedplumProvider>
    );
    const { result } = renderHook(
      () =>
        usePatientSummaryData({ reference: 'Patient/123' }, [
          { key: 'problems', searches: [{ key: 'conditions', resourceType: 'Condition' }] },
          {
            key: 'allergies',
            searches: [{ key: 'allergies', resourceType: 'AllergyIntolerance', patientParam: 'patient' }],
          },
          { key: 'medications', searches: [{ key: 'medications', resourceType: 'MedicationRequest' }] },
        ]),
      { wrapper }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sectionData).toEqual([{ conditions: [] }, { allergies: [] }, { medications: [medication] }]);
    expect(result.current.error).toBe(conditionError);

    const details = { source: 'usePatientSummaryData', message: 'Patient summary search failed' };
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith(conditionError, details);
    expect(onError).toHaveBeenCalledWith(allergyError, details);
  });
});
