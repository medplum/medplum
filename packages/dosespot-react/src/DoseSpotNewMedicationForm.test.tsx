import { act, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { MedicationKnowledge } from '@medplum/fhirtypes';
import { DoseSpotNewMedicationForm } from './DoseSpotNewMedicationForm';

// Mock DoseSpotMedicationSelect
vi.mock('./DoseSpotMedicationSelect', () => ({
  DoseSpotMedicationSelect: ({ onMedicationSelect }: any) => (
    <div data-testid="medication-select">
      <button 
        data-testid="select-medication"
        onClick={() => {
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
          onMedicationSelect(mockMedication);
        }}
      >
        Select Medication
      </button>
    </div>
  )
}));

// Mock Mantine components
vi.mock('@mantine/core', () => ({
  Box: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Group: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  Stack: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  Text: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  TextInput: ({ label, id, ...props }: any) => (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} {...props} />
    </div>
  ),
  NumberInput: ({ label, id, ...props }: any) => (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" {...props} />
    </div>
  ),
  Divider: () => <hr />,
  MantineProvider: ({ children }: any) => <div>{children}</div>
}));

describe('DoseSpotNewMedicationForm', () => {
  const mockSearchMedications = vi.fn();
  const mockAddFavoriteMedication = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
  });

  test('renders without crashing', async () => {
    await act(async () => {
      render(
        <DoseSpotNewMedicationForm
          searchMedications={mockSearchMedications}
          addFavoriteMedication={mockAddFavoriteMedication}
        />
      );
    });
    
    expect(screen.getByTestId('medication-select')).toBeDefined();
  });
}); 