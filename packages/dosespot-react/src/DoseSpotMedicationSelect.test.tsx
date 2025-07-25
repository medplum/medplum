import { act, render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { MedicationKnowledge } from '@medplum/fhirtypes';
import { DoseSpotMedicationSelect } from './DoseSpotMedicationSelect';

// Mock AsyncAutocomplete
vi.mock('@medplum/react', () => ({
  AsyncAutocomplete: ({ onChange, placeholder, minInputLength }: any) => (
    <div data-testid="async-autocomplete">
      <input 
        data-testid="medication-input"
        placeholder={placeholder}
        minLength={minInputLength}
        onChange={(e) => {
          if (e.target.value.length >= 3) {
            const mockMedication: MedicationKnowledge = {
              resourceType: 'MedicationKnowledge',
              id: 'med-1',
              code: {
                text: 'Aspirin 325mg tablet',
                coding: [
                  {
                    system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
                    code: '1191',
                    display: 'Aspirin 325mg tablet'
                  }
                ]
              }
            };
            onChange([mockMedication]);
          }
        }}
      />
    </div>
  )
}));

// Mock notifications
vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn()
}));

describe('DoseSpotMedicationSelect', () => {
  const mockSearchMedications = vi.fn();
  const mockOnMedicationSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders without crashing', async () => {
    await act(async () => {
      render(
        <DoseSpotMedicationSelect
          searchMedications={mockSearchMedications}
          onMedicationSelect={mockOnMedicationSelect}
        />
      );
    });
    
    expect(screen.getByTestId('async-autocomplete')).toBeDefined();
    expect(screen.getByTestId('medication-input')).toBeDefined();
  });

  test('has correct placeholder text', async () => {
    await act(async () => {
      render(
        <DoseSpotMedicationSelect
          searchMedications={mockSearchMedications}
          onMedicationSelect={mockOnMedicationSelect}
        />
      );
    });
    
    expect(screen.getByPlaceholderText('Search medications...')).toBeDefined();
  });

  test('calls onMedicationSelect when medication is selected', async () => {
    await act(async () => {
      render(
        <DoseSpotMedicationSelect
          searchMedications={mockSearchMedications}
          onMedicationSelect={mockOnMedicationSelect}
        />
      );
    });
    
    const input = screen.getByTestId('medication-input');
    fireEvent.change(input, { target: { value: 'aspirin' } });
    
    expect(mockOnMedicationSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'MedicationKnowledge',
        id: 'med-1',
        code: expect.objectContaining({
          text: 'Aspirin 325mg tablet'
        })
      })
    );
  });
}); 