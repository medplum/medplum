// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Communication, OperationDefinition, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, renderHook } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { useTwilioSms } from './useTwilioSms';

const TEST_PATIENT: Patient = {
  resourceType: 'Patient',
  id: 'patient-1',
  telecom: [{ system: 'phone', value: '+15005550006', use: 'mobile' }],
};

const PATIENT_NO_PHONE: Patient = {
  resourceType: 'Patient',
  id: 'patient-2',
};

const MOCK_OPERATION_DEF: OperationDefinition & { id: string } = {
  resourceType: 'OperationDefinition',
  id: 'send-sms-twilio',
  url: 'https://medplum.com/fhir/OperationDefinition/send-sms-twilio',
  name: 'Send SMS via Twilio',
  status: 'active',
  kind: 'operation',
  code: 'send-sms-twilio',
  system: false,
  type: true,
  instance: true,
};

const MOCK_SENT_COMMUNICATION: Communication = {
  resourceType: 'Communication',
  id: 'comm-1',
  status: 'in-progress',
  identifier: [{ system: 'https://www.twilio.com/', value: 'SMxxx' }],
};

describe('useTwilioSms', () => {
  let medplum: MockClient;

  beforeAll(() => {
    vi.useFakeTimers();
  });

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  function wrapper({ children }: { children: ReactNode }): JSX.Element {
    return (
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
      </MemoryRouter>
    );
  }

  test('returns initial state', () => {
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(undefined);
    const { result } = renderHook(() => useTwilioSms({ patient: TEST_PATIENT }), { wrapper });

    expect(result.current.twilioAvailable).toBe(false);
    expect(result.current.sending).toBe(false);
    expect(result.current.error).toBeUndefined();
    expect(result.current.deliveryStatus).toBeUndefined();
  });

  test('twilioAvailable becomes true when OperationDefinition is found', async () => {
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(MOCK_OPERATION_DEF);
    const { result } = renderHook(() => useTwilioSms({ patient: TEST_PATIENT }), { wrapper });

    await act(async () => {});

    expect(result.current.twilioAvailable).toBe(true);
  });

  test('twilioAvailable stays false when OperationDefinition is not found', async () => {
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(undefined);
    const { result } = renderHook(() => useTwilioSms({ patient: TEST_PATIENT }), { wrapper });

    await act(async () => {});

    expect(result.current.twilioAvailable).toBe(false);
  });

  test('twilioAvailable stays false when OperationDefinition check fails', async () => {
    vi.spyOn(medplum, 'searchOne').mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useTwilioSms({ patient: TEST_PATIENT }), { wrapper });

    await act(async () => {});

    expect(result.current.twilioAvailable).toBe(false);
  });

  test('patientHasPhone is true when patient has a phone number', () => {
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(undefined);
    const { result } = renderHook(() => useTwilioSms({ patient: TEST_PATIENT }), { wrapper });

    expect(result.current.patientHasPhone).toBe(true);
  });

  test('patientHasPhone is false when patient has no phone number', () => {
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(undefined);
    const { result } = renderHook(() => useTwilioSms({ patient: PATIENT_NO_PHONE }), { wrapper });

    expect(result.current.patientHasPhone).toBe(false);
  });

  test('sendSms posts to the correct FHIR operation endpoint with correct body', async () => {
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(undefined);
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValue(MOCK_SENT_COMMUNICATION);
    const { result } = renderHook(() => useTwilioSms({ patient: TEST_PATIENT }), { wrapper });

    await act(async () => {
      await result.current.sendSms('Your appointment is tomorrow.');
    });

    expect(postSpy).toHaveBeenCalledOnce();
    const [url, body] = postSpy.mock.calls[0] as [URL, Communication];
    expect(url.toString()).toContain('Communication/$send-sms-twilio');
    expect(body.payload?.[0]?.contentString).toBe('Your appointment is tomorrow.');
    expect(body.recipient?.[0]?.reference).toBe('Patient/patient-1');
    expect(body.subject?.reference).toBe('Patient/patient-1');
    expect(body.medium?.[0]?.coding?.[0]?.code).toBe('SMSWRIT');
  });

  test('sendSms sets sending to true during call and false after', async () => {
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(undefined);
    let resolveSend!: (value: Communication) => void;
    vi.spyOn(medplum, 'post').mockReturnValue(
      new Promise<Communication>((resolve) => {
        resolveSend = resolve;
      })
    );
    const { result } = renderHook(() => useTwilioSms({ patient: TEST_PATIENT }), { wrapper });

    act(() => {
      result.current.sendSms('Hello!').catch(() => undefined);
    });
    expect(result.current.sending).toBe(true);

    await act(async () => {
      resolveSend(MOCK_SENT_COMMUNICATION);
    });
    expect(result.current.sending).toBe(false);
  });

  test('sendSms sets error state and rethrows when post fails', async () => {
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(undefined);
    vi.spyOn(medplum, 'post').mockRejectedValue(new Error('Twilio API error'));
    const { result } = renderHook(() => useTwilioSms({ patient: TEST_PATIENT }), { wrapper });

    await act(async () => {
      await result.current.sendSms('Hello!').catch(() => undefined);
    });

    expect(result.current.error?.message).toBe('Twilio API error');
    expect(result.current.sending).toBe(false);
  });

  test('deliveryStatus reflects the status of the sent Communication', async () => {
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(undefined);
    vi.spyOn(medplum, 'post').mockResolvedValue(MOCK_SENT_COMMUNICATION);
    const { result } = renderHook(() => useTwilioSms({ patient: TEST_PATIENT }), { wrapper });

    await act(async () => {
      await result.current.sendSms('Hello!');
    });

    expect(result.current.deliveryStatus).toBe('in-progress');
  });

  test('deliveryStatus updates to completed via subscription event', async () => {
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(undefined);
    vi.spyOn(medplum, 'post').mockResolvedValue(MOCK_SENT_COMMUNICATION);
    const { result } = renderHook(() => useTwilioSms({ patient: TEST_PATIENT }), { wrapper });

    await act(async () => {
      await result.current.sendSms('Hello!');
    });

    const updatedCommunication: Communication = { ...MOCK_SENT_COMMUNICATION, status: 'completed' };

    await act(async () => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>(`Communication?_id=${MOCK_SENT_COMMUNICATION.id}`, {
        type: 'message',
        payload: {
          resourceType: 'Bundle',
          type: 'history',
          entry: [{ resource: updatedCommunication }],
        },
      });
    });

    expect(result.current.deliveryStatus).toBe('completed');
  });

  test('deliveryStatus updates to stopped on failed delivery', async () => {
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(undefined);
    vi.spyOn(medplum, 'post').mockResolvedValue(MOCK_SENT_COMMUNICATION);
    const { result } = renderHook(() => useTwilioSms({ patient: TEST_PATIENT }), { wrapper });

    await act(async () => {
      await result.current.sendSms('Hello!');
    });

    const failedCommunication: Communication = { ...MOCK_SENT_COMMUNICATION, status: 'stopped' };

    await act(async () => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>(`Communication?_id=${MOCK_SENT_COMMUNICATION.id}`, {
        type: 'message',
        payload: {
          resourceType: 'Bundle',
          type: 'history',
          entry: [{ resource: failedCommunication }],
        },
      });
    });

    expect(result.current.deliveryStatus).toBe('stopped');
  });
});
