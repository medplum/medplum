import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, render, screen } from '@testing-library/react';
import { JSX } from 'react';
import { vi } from 'vitest';
import { MedicationKnowledge } from '@medplum/fhirtypes';
import { useDoseSpotClinicFormulary } from './useDoseSpotFormularyCenter';

function TestComponent(): JSX.Element {
  const { searchResults, searchLoading, addFavoriteMedicationLoading } = useDoseSpotClinicFormulary();
  return (
    <div>
      <div>Loading: {searchLoading ? 'true' : 'false'}</div>
      <div>AddLoading: {addFavoriteMedicationLoading ? 'true' : 'false'}</div>
      <div>Results: {searchResults?.entry?.length || 0}</div>
    </div>
  );
}

describe('useDoseSpotClinicFormulary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('initializes with correct default values', async () => {
    const medplum = new MockClient();

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <TestComponent />
        </MedplumProvider>
      );
    });

    expect(screen.getByText('Loading: false')).toBeDefined();
    expect(screen.getByText('AddLoading: false')).toBeDefined();
    expect(screen.getByText('Results: 0')).toBeDefined();
  });

  test('calls executeBot when searchMedications is called', async () => {
    const medplum = new MockClient();
    const mockBundle = {
      resourceType: 'Bundle',
      entry: [
        {
          resource: {
            resourceType: 'MedicationKnowledge',
            id: 'med-1',
            code: { text: 'Test Medication' }
          } as MedicationKnowledge
        }
      ]
    };

    const executeBotMock = vi.fn().mockResolvedValue(mockBundle);
    medplum.executeBot = executeBotMock;

    let hookResult: any;

    function TestHookComponent(): JSX.Element {
      hookResult = useDoseSpotClinicFormulary();
      return <div>Test</div>;
    }

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <TestHookComponent />
        </MedplumProvider>
      );
    });

    await act(async () => {
      await hookResult.searchMedications('aspirin');
    });

    expect(executeBotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'https://www.medplum.com/bots',
        value: 'dosespot-search-medication-bot'
      }),
      { name: 'aspirin' }
    );
  });

  test('calls executeBot when addFavoriteMedication is called', async () => {
    const medplum = new MockClient();
    const mockMedication: MedicationKnowledge = {
      resourceType: 'MedicationKnowledge',
      id: 'med-1',
      code: { text: 'Test Medication' }
    };

    const executeBotMock = vi.fn().mockResolvedValue(mockMedication);
    medplum.executeBot = executeBotMock;

    let hookResult: any;

    function TestHookComponent(): JSX.Element {
      hookResult = useDoseSpotClinicFormulary();
      return <div>Test</div>;
    }

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <TestHookComponent />
        </MedplumProvider>
      );
    });

    await act(async () => {
      await hookResult.addFavoriteMedication(mockMedication);
    });

    expect(executeBotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'https://www.medplum.com/bots',
        value: 'dosespot-add-favorite-medication-bot'
      }),
      mockMedication
    );
  });

}); 