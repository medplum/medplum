import { Button, Group, SegmentedControl, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ContentType, normalizeErrorString, resolveId } from '@medplum/core';
import { Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconCheck, IconX } from '@tabler/icons-react';
import { useCallback } from 'react';
import { DateTimeInput } from '../DateTimeInput/DateTimeInput';
import { Form } from '../Form/Form';
import { FormSection } from '../FormSection/FormSection';

export interface PatientExportFormProps {
  readonly patient: Patient | Reference<Patient>;
}

const NOTIFICATION_ID = 'patient-export';
const NOTIFICATION_TITLE = 'Patient Export';

export function PatientExportForm(props: PatientExportFormProps): JSX.Element {
  const medplum = useMedplum();
  const { patient } = props;

  const handleSubmit = useCallback(
    async (data: Record<string, string>) => {
      const patientId = resolveId(patient) as string;
      const url = medplum.fhirUrl('Patient', patientId, data.format);

      if (data.startDate) {
        url.searchParams.append('start', data.startDate);
      }

      if (data.endDate) {
        url.searchParams.append('end', data.endDate);
      }

      notifications.show({
        id: NOTIFICATION_ID,
        title: NOTIFICATION_TITLE,
        loading: true,
        message: 'Exporting...',
        autoClose: false,
        withCloseButton: false,
      });

      try {
        const response = await medplum.get(url, { cache: 'no-cache' });

        saveData(
          response,
          `Patient-export-${patientId}-${new Date().toISOString().replaceAll(':', '-')}.json`,
          ContentType.FHIR_JSON
        );

        notifications.update({
          id: NOTIFICATION_ID,
          title: NOTIFICATION_TITLE,
          color: 'green',
          message: 'Done',
          icon: <IconCheck size="1rem" />,
          loading: false,
          autoClose: false,
          withCloseButton: true,
        });

        console.log(response);
      } catch (err) {
        notifications.update({
          id: NOTIFICATION_ID,
          title: NOTIFICATION_TITLE,
          color: 'red',
          message: normalizeErrorString(err),
          icon: <IconX size="1rem" />,
          loading: false,
          autoClose: false,
          withCloseButton: true,
        });
      }
    },
    [medplum, patient]
  );

  return (
    <Form onSubmit={handleSubmit}>
      <Stack>
        <FormSection title="Export Format" description="Required" withAsterisk>
          <SegmentedControl
            name="format"
            data={[
              { label: 'FHIR Everything', value: '$everything' },
              { label: 'Patient Summary', value: '$summary' },
              { label: 'C-CDA', value: '$ccda-export' },
            ]}
            fullWidth
          />
        </FormSection>
        <FormSection
          title="Start Date"
          description="If no start date is provided, all records prior to the end date are in scope."
        >
          <DateTimeInput name="startDate" onChange={console.log} />
        </FormSection>
        <FormSection
          title="End Date"
          description="If no end date is provided, all records subsequent to the start date are in scope."
        >
          <DateTimeInput name="endDate" onChange={console.log} />
        </FormSection>
        <Group justify="right">
          <Button type="submit">Request Export</Button>
        </Group>
      </Stack>
    </Form>
  );
}

/**
 * Tricks the browser into downloading a file.
 *
 * This function creates a temporary anchor (<a>) element, converts the provided data to a Blob,
 * and then simulates a click on the link to trigger a file download in the browser.
 *
 * See: https://stackoverflow.com/a/19328891
 *
 * @param data - The data to save.
 * @param fileName - The name of the file.
 * @param contentType - The content type of the file.
 */
function saveData(data: any, fileName: string, contentType: string): void {
  const a = document.createElement('a');
  document.body.appendChild(a);
  a.style.display = 'none';
  const json = JSON.stringify(data);
  const blob = new Blob([json], { type: contentType });
  const url = window.URL.createObjectURL(blob);
  a.href = url;
  a.download = fileName;
  a.click();
  window.URL.revokeObjectURL(url);
}
