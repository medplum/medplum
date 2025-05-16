import { Button, Group, Stack, TextInput, Select } from '@mantine/core';
import { Device, Patient } from '@medplum/fhirtypes';
import { useCallback, JSX } from 'react';

export interface DeviceDialogProps {
  readonly patient: Patient;
  readonly device?: Device;
  readonly onSubmit: (device: Device) => void;
}

export function DeviceDialog(props: DeviceDialogProps): JSX.Element {
  const { patient, device, onSubmit } = props;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const formData = new FormData(e.target as HTMLFormElement);
      const deviceName = formData.get('deviceName') as string;
      const deviceType = formData.get('deviceType') as string;
      const status = formData.get('status') as 'active' | 'inactive' | 'entered-in-error' | 'unknown';

      const updatedDevice: Device = {
        ...device,
        resourceType: 'Device',
        deviceName: [
          {
            name: deviceName,
            type: 'user-friendly-name'
          }
        ],
        type: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '49062001',
              display: deviceType
            }
          ],
          text: deviceType
        },
        status: status,
        patient: {
          reference: `Patient/${patient.id}`
        }
      };

      onSubmit(updatedDevice);
    },
    [device, onSubmit, patient.id]
  );

  return (
    <form onSubmit={handleSubmit}>
      <Stack>
        <TextInput
          label="Device Name"
          name="deviceName"
          defaultValue={device?.deviceName?.[0]?.name}
          required
        />
        <TextInput
          label="Device Type"
          name="deviceType"
          defaultValue={device?.type?.coding?.[0]?.display || device?.type?.text}
          required
        />
        <Select
          label="Status"
          name="status"
          defaultValue={device?.status || 'active'}
          data={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
            { value: 'entered-in-error', label: 'Entered in Error' },
            { value: 'unknown', label: 'Unknown' }
          ]}
          required
        />
        <Group justify="flex-end" mt="md">
          <Button type="submit">{device ? 'Update' : 'Create'}</Button>
        </Group>
      </Stack>
    </form>
  );
} 