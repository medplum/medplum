// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ResourceModifiedEvent } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { renderHook } from '@testing-library/react';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { useResourceModified } from './useResourceModified';

describe('useResourceModified', () => {
  function setup(
    medplum: MockClient,
    resourceType: Parameters<typeof useResourceModified>[0],
    callback: (event: ResourceModifiedEvent) => void
  ): { unmount: () => void } {
    return renderHook(() => useResourceModified(resourceType, callback), {
      wrapper: ({ children }) => <MedplumProvider medplum={medplum}>{children}</MedplumProvider>,
    });
  }

  test('Invokes callback for matching modifications', async () => {
    const medplum = new MockClient();
    const events: ResourceModifiedEvent[] = [];
    setup(medplum, 'Patient', (event) => events.push(event));

    const patient = await medplum.createResource({ resourceType: 'Patient' });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ resourceType: 'Patient', operation: 'create', id: patient.id });

    await medplum.deleteResource('Patient', patient.id);

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ resourceType: 'Patient', operation: 'delete', id: patient.id });
  });

  test('Ignores modifications to other resource types', async () => {
    const medplum = new MockClient();
    const events: ResourceModifiedEvent[] = [];
    setup(medplum, ['Slot', 'Appointment'], (event) => events.push(event));

    await medplum.createResource({ resourceType: 'Practitioner' });
    expect(events).toHaveLength(0);

    medplum.notifyResourceModified({ resourceType: 'Slot', operation: 'update' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ resourceType: 'Slot', operation: 'update' });
  });

  test('Removes listener on unmount', async () => {
    const medplum = new MockClient();
    const callback = vi.fn();
    const { unmount } = setup(medplum, 'Patient', callback);

    expect(medplum.listenerCount('resourceModified')).toBe(1);
    unmount();
    expect(medplum.listenerCount('resourceModified')).toBe(0);

    await medplum.createResource({ resourceType: 'Patient' });
    expect(callback).not.toHaveBeenCalled();
  });
});
