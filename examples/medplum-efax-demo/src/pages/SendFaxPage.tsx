// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, FileInput, Stack, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { showNotification } from '@mantine/notifications';
import { createReference, normalizeErrorString } from '@medplum/core';
import type { Communication, Practitioner } from '@medplum/fhirtypes';
import { Document, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconFile, IconSend } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';

interface SendFaxFormValues {
  recipientName: string;
  faxNumber: string;
  file: File | null;
}

export function SendFaxPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner;
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);

  const form = useForm<SendFaxFormValues>({
    initialValues: {
      recipientName: '',
      faxNumber: '',
      file: null,
    },
    validate: {
      recipientName: (value) => (value.trim() ? null : 'Recipient name is required'),
      faxNumber: (value) => {
        if (!value.trim()) {
          return 'Fax number is required';
        }
        // Basic phone number validation
        const digits = value.replace(/\D/g, '');
        if (digits.length < 10) {
          return 'Fax number must have at least 10 digits';
        }
        return null;
      },
      file: (value) => (value ? null : 'Please select a file to fax'),
    },
  });

  const handleSubmit = useCallback(
    async (values: SendFaxFormValues) => {
      if (!values.file) {
        return;
      }

      setSending(true);
      try {
        // 1. Upload the file as an attachment
        const fileBuffer = await values.file.arrayBuffer();
        const attachment = await medplum.createAttachment({
          data: new Uint8Array(fileBuffer),
          contentType: values.file.type,
          filename: values.file.name,
        });

        // 2. Create a temporary Practitioner to represent the recipient
        // In a real app, you might search for or create an Organization/Practitioner
        const recipient = await medplum.createResource<Practitioner>({
          resourceType: 'Practitioner',
          name: [{ text: values.recipientName }],
          telecom: [{ system: 'fax', value: values.faxNumber }],
        });

        // 3. Create the Communication resource
        const communication = await medplum.createResource<Communication>({
          resourceType: 'Communication',
          status: 'preparation',
          medium: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode',
                  code: 'FAXWRIT',
                },
              ],
            },
          ],
          sender: createReference(profile),
          recipient: [createReference(recipient)],
          payload: [{ contentAttachment: attachment }],
        });

        // 4. Call the $send-efax operation
        const result = await medplum.post(medplum.fhirUrl('Communication', '$send-efax'), communication);

        showNotification({
          color: 'green',
          title: 'Fax Sent',
          message: `Fax queued successfully. ID: ${result?.id }`,
        });

        // Navigate back to inbox
        await navigate('/');
      } catch (err) {
        showNotification({
          color: 'red',
          title: 'Error',
          message: normalizeErrorString(err),
        });
      } finally {
        setSending(false);
      }
    },
    [medplum, profile, navigate]
  );

  return (
    <Document>
      <Title order={1} mb="lg">
        Send Fax
      </Title>

      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="md" maw={500}>
          <TextInput
            label="Recipient Name"
            placeholder="John Smith"
            required
            {...form.getInputProps('recipientName')}
          />

          <TextInput
            label="Fax Number"
            placeholder="+1 (555) 123-4567"
            required
            {...form.getInputProps('faxNumber')}
          />

          <FileInput
            label="Document to Fax"
            placeholder="Click to select file"
            required
            accept=".pdf,.png,.jpg,.jpeg"
            leftSection={<IconFile size={16} />}
            {...form.getInputProps('file')}
          />

          <Button type="submit" leftSection={<IconSend size={16} />} loading={sending} mt="md">
            Send Fax
          </Button>
        </Stack>
      </form>
    </Document>
  );
}
