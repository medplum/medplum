// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';

type AppointmentCancelButtonProps = {
  readonly appointment: WithId<Appointment>;
  onCancel?: (appointment: WithId<Appointment>) => void;
};

export function AppointmentCancelButton(props: AppointmentCancelButtonProps): JSX.Element {
  const medplum = useMedplum();
  const { appointment, onCancel } = props;
  const [loading, setLoading] = useState(false);

  const handleCancel = useCallback(async () => {
    setLoading(true);
    try {
      const updated = await medplum.post<WithId<Appointment>>(
        medplum.fhirUrl('Appointment', appointment.id, '$cancel')
      );
      medplum.invalidateSearches('Appointment');
      medplum.invalidateSearches('Slot');
      onCancel?.(updated);
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setLoading(false);
    }
  }, [medplum, appointment, onCancel]);

  return (
    <Button
      loading={loading}
      onClick={handleCancel}
      variant="outline"
      color="red"
      leftSection={<IconTrash size={16} />}
    >
      Cancel Visit
    </Button>
  );
}
