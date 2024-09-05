import { MockClient } from '@medplum/mock';
import { act, renderHook } from '@testing-library/react';
import { useHealthGorillaLabOrder, UseHealthGorillaLabOrderReturn } from './useHealthGorillaLabOrder';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from '@medplum/react';

describe('useHealthGorilla', () => {
  let medplum: MockClient;
  beforeEach(() => {
    medplum = new MockClient();
  });

  function setup(): ReturnType<typeof renderHook<UseHealthGorillaLabOrderReturn, unknown>> {
    return renderHook(() => useHealthGorillaLabOrder({ patient: { resourceType: 'Patient' }, requester: undefined }), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
        </MemoryRouter>
      ),
    });
  }

  test('Hello, world', async () => {
    const { result } = setup();
    // expect(await result.current.createOrder()).toMatchObject({ resourceType: 'ServiceRequest' });
    expect(result.current.state.performingLab).toBeUndefined();

    act(() => result.current.setPerformingLab({ resourceType: 'Organization', name: 'Test Lab', id: 'f-12345' }));

    expect(result.current.state.performingLab).toMatchObject({ resourceType: 'Organization', name: 'Test Lab' });
    // expect(await result.current.createOrder()).toMatchObject({ resourceType: 'ServiceRequest' });
  });

  test('specimenCollectedDateTime', async () => {
    const { result } = setup();
    const date = new Date('2022-12-29T14:30:00Z');
    expect(result.current.state.specimenCollectedDateTime).toBeUndefined();
    act(() => result.current.setSpecimenCollectedDateTime(date));
    expect(result.current.state.specimenCollectedDateTime).toEqual(date);
  });
});
