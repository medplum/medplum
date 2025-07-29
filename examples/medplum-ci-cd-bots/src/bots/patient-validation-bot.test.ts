import { describe, it, expect, vi } from 'vitest';
import { BotEvent, MedplumClient, OperationOutcomeError } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { handler } from './patient-validation-bot';

// Mock the shared modules
vi.mock('../shared/validation-helpers', () => ({
  validatePatientComprehensive: vi.fn(),
  createOperationOutcome: vi.fn(),
}));

vi.mock('../shared/audit-helpers', () => ({
  logValidationResult: vi.fn(),
  logError: vi.fn(),
}));

describe('Patient Validation Bot', () => {
  const mockMedplum = {} as MedplumClient;

  const validPatient: Patient = {
    resourceType: 'Patient',
    id: 'patient-1',
    name: [
      {
        given: ['John'],
        family: 'Doe',
      },
    ],
    birthDate: '1990-01-01',
    gender: 'male',
  };

  const mockEvent: BotEvent = {
    input: validPatient,
    headers: {},
    secrets: {},
    bot: {} as any,
    contentType: 'application/fhir+json',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return patient when validation passes', async () => {
    const { validatePatientComprehensive } = await import('../shared/validation-helpers');
    const { logValidationResult } = await import('../shared/audit-helpers');

    vi.mocked(validatePatientComprehensive).mockReturnValue({
      isValid: true,
      errors: [],
      warnings: [],
    });

    const result = await handler(mockMedplum, mockEvent);

    expect(result).toEqual(validPatient);
    expect(validatePatientComprehensive).toHaveBeenCalledWith(validPatient);
    expect(logValidationResult).toHaveBeenCalledWith(validPatient, {
      isValid: true,
      errors: [],
      warnings: [],
    });
  });

  it('should throw OperationOutcomeError when validation fails', async () => {
    const { validatePatientComprehensive, createOperationOutcome } = await import('../shared/validation-helpers');
    const { logValidationResult } = await import('../shared/audit-helpers');

    const validationResult = {
      isValid: false,
      errors: ['Patient must have a birth date'],
      warnings: [],
    };

    const operationOutcome = {
      resourceType: 'OperationOutcome' as const,
      issue: [
        {
          severity: 'error' as const,
          code: 'invalid' as const,
          diagnostics: 'Patient must have a birth date',
        },
      ],
    };

    vi.mocked(validatePatientComprehensive).mockReturnValue(validationResult);
    vi.mocked(createOperationOutcome).mockReturnValue(operationOutcome);

    await expect(handler(mockMedplum, mockEvent)).rejects.toThrow(OperationOutcomeError);

    expect(validatePatientComprehensive).toHaveBeenCalledWith(validPatient);
    expect(createOperationOutcome).toHaveBeenCalledWith(validationResult);
    expect(logValidationResult).toHaveBeenCalledWith(validPatient, validationResult);
  });

  it('should log errors and rethrow when unexpected error occurs', async () => {
    const { validatePatientComprehensive } = await import('../shared/validation-helpers');
    const { logError } = await import('../shared/audit-helpers');

    const unexpectedError = new Error('Unexpected error');
    vi.mocked(validatePatientComprehensive).mockImplementation(() => {
      throw unexpectedError;
    });

    await expect(handler(mockMedplum, mockEvent)).rejects.toThrow('Unexpected error');

    expect(logError).toHaveBeenCalledWith(unexpectedError, {
      botName: 'patient-validation-bot',
      patientId: validPatient.id,
    });
  });

  it('should handle patient with missing required fields', async () => {
    const { validatePatientComprehensive } = await import('../shared/validation-helpers');

    const invalidPatient = {
      ...validPatient,
      name: undefined,
      birthDate: undefined,
    };

    const validationResult = {
      isValid: false,
      errors: ['Patient must have at least one name', 'Patient must have a birth date'],
      warnings: [],
    };

    vi.mocked(validatePatientComprehensive).mockReturnValue(validationResult);

    const eventWithInvalidPatient: BotEvent = {
      ...mockEvent,
      input: invalidPatient,
    };

    await expect(handler(mockMedplum, eventWithInvalidPatient)).rejects.toThrow(OperationOutcomeError);

    expect(validatePatientComprehensive).toHaveBeenCalledWith(invalidPatient);
  });

  it('should handle patient with warnings only', async () => {
    const { validatePatientComprehensive } = await import('../shared/validation-helpers');

    const validationResult = {
      isValid: true,
      errors: [],
      warnings: ['Patient gender is recommended but not required'],
    };

    vi.mocked(validatePatientComprehensive).mockReturnValue(validationResult);

    const result = await handler(mockMedplum, mockEvent);

    expect(result).toEqual(validPatient);
    expect(validatePatientComprehensive).toHaveBeenCalledWith(validPatient);
  });
}); 