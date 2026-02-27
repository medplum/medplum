// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, FileInput, Stack, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, isNotFound, normalizeErrorString, OperationOutcomeError } from '@medplum/core';
import type { Communication, Organization } from '@medplum/fhirtypes';
import { Document, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconFile, IconSend } from '@tabler/icons-react';
import { useState } from 'react';
import type { JSX } from 'react';

interface SendFaxForm {
  recipientName: string;
  faxNumber: string;
  file: File | null;
}

export function SendFaxPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  const [formData, setFormData] = useState<SendFaxForm>({
    recipientName: '',
    faxNumber: '',
    file: null,
  });
  const [sending, setSending] = useState(false);

  const handleSendFax = async (): Promise<void> => {
    // Validation
    if (!formData.recipientName.trim()) {
      showNotification({ title: 'Error', message: 'Recipient name is required', color: 'red' });
      return;
    }

    if (!formData.faxNumber.trim()) {
      showNotification({ title: 'Error', message: 'Fax number is required', color: 'red' });
      return;
    }

    const digits = formData.faxNumber.replace(/\D/g, '');
    if (digits.length < 10) {
      showNotification({ title: 'Error', message: 'Fax number must have at least 10 digits', color: 'red' });
      return;
    }

    if (!formData.file) {
      showNotification({ title: 'Error', message: 'Please select a file to fax', color: 'red' });
      return;
    }

    if (profile?.resourceType !== 'Practitioner') {
      showNotification({ title: 'Error', message: 'Invalid practitioner profile', color: 'red' });
      return;
    }

    setSending(true);
    try {
      // Step 1: Upload the file as an attachment (creates Binary resource)
      const attachment = await medplum.createAttachment({
        data: formData.file,
        contentType: formData.file.type,
        filename: formData.file.name,
      });

      // Step 2: Create the recipient Organization
      const recipient = await medplum.createResource<Organization>({
        resourceType: 'Organization',
        name: formData.recipientName,
        contact: [{ telecom: [{ system: 'fax', value: formData.faxNumber }] }],
      });

      // Step 3: Create the Communication with proper references
      const communication = await medplum.createResource<Communication>({
        resourceType: 'Communication',
        status: 'in-progress',
        category: [{ coding: [{ system: 'http://medplum.com/fhir/CodeSystem/fax-direction', code: 'outbound' }] }],
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

      // Step 4: Call the $send-efax operation
      const sendEfaxUrl = medplum.fhirUrl('Communication', '$send-efax');
      try {
        await medplum.post(sendEfaxUrl, communication);
      } catch (efaxErr) {
        // Check if this is a 404 error for the efax operation
        if (efaxErr instanceof OperationOutcomeError && isNotFound(efaxErr.outcome)) {
          showNotification({
            color: 'red',
            title: 'Error',
            message: 'Efax integration not setup contact Medplum Support',
          });
          return;
        }
        // Re-throw if it's not a 404
        throw efaxErr;
      }

      showNotification({
        color: 'green',
        title: 'Success',
        message: `Fax sent successfully`,
      });
    } catch (err) {
      showNotification({
        color: 'red',
        title: 'Error',
        message: normalizeErrorString(err),
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Document>
      <Title>Send Fax</Title>
      <Stack gap="lg" mt="lg">
        <TextInput
          label="Organization Name"
          placeholder="Enter organization name"
          value={formData.recipientName}
          onChange={(e) => setFormData((prev) => ({ ...prev, recipientName: e.target.value }))}
          required
        />

        <TextInput
          label="Fax Number"
          placeholder="+1 (555) 123-4567"
          value={formData.faxNumber}
          onChange={(e) => setFormData((prev) => ({ ...prev, faxNumber: e.target.value }))}
          required
        />

        <FileInput
          label="Document to Fax"
          placeholder="Click to select file"
          accept=".pdf,.png,.jpg,.jpeg"
          leftSection={<IconFile size={16} />}
          value={formData.file}
          onChange={(file) => setFormData((prev) => ({ ...prev, file }))}
          required
        />

        <Button
          onClick={handleSendFax}
          leftSection={<IconSend size={16} />}
          loading={sending}
          disabled={!formData.recipientName || !formData.faxNumber || !formData.file}
        >
          Send Fax
        </Button>
      </Stack>
    </Document>
  );
}
