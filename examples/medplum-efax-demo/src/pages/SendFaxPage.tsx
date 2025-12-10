// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, FileInput, Stack, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, normalizeErrorString } from '@medplum/core';
import type { Binary, Bundle, BundleEntry, Communication, Practitioner } from '@medplum/fhirtypes';
import { Document, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconFile, IconSend } from '@tabler/icons-react';
import { useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';

interface SendFaxForm {
  recipientName: string;
  faxNumber: string;
  file: File | null;
}

export function SendFaxPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner;
  const navigate = useNavigate();

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

    setSending(true);
    try {
      // Read the file as base64 for the Binary resource
      const fileBuffer = await formData.file.arrayBuffer();
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));

      // Create UUIDs for the transaction bundle references
      const binaryFullUrl = 'urn:uuid:binary-' + crypto.randomUUID();
      const recipientFullUrl = 'urn:uuid:recipient-' + crypto.randomUUID();
      const communicationFullUrl = 'urn:uuid:communication-' + crypto.randomUUID();

      // Build the transaction bundle with all resources
      // This ensures atomic creation - all succeed or none are created
      const bundle: Bundle = {
        resourceType: 'Bundle',
        type: 'transaction',
        entry: [
          // Entry 1: Binary (the document to fax)
          {
            fullUrl: binaryFullUrl,
            request: { method: 'POST', url: 'Binary' },
            resource: {
              resourceType: 'Binary',
              contentType: formData.file.type,
              data: base64Data,
            } as Binary,
          },
          // Entry 2: Practitioner (the recipient with fax number)
          {
            fullUrl: recipientFullUrl,
            request: { method: 'POST', url: 'Practitioner' },
            resource: {
              resourceType: 'Practitioner',
              name: [{ text: formData.recipientName }],
              telecom: [{ system: 'fax', value: formData.faxNumber }],
            } as Practitioner,
          },
          // Entry 3: Communication (references Binary and Practitioner)
          {
            fullUrl: communicationFullUrl,
            request: { method: 'POST', url: 'Communication' },
            resource: {
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
              recipient: [{ reference: recipientFullUrl }],
              payload: [
                {
                  contentAttachment: {
                    url: binaryFullUrl,
                    contentType: formData.file.type,
                    title: formData.file.name,
                  },
                },
              ],
            } as Communication,
          },
        ],
      };

      // Execute the transaction bundle
      const result = await medplum.executeBatch(bundle);

      // Extract the created Communication from the bundle response
      const communicationEntry = result.entry?.find(
        (entry: BundleEntry) => entry.resource?.resourceType === 'Communication'
      );

      if (!communicationEntry?.resource) {
        throw new Error('Failed to create Communication resource');
      }

      const communication = communicationEntry.resource as Communication;

      // Update the Communication with the actual Binary URL from the response
      const binaryEntry = result.entry?.find((entry: BundleEntry) => entry.resource?.resourceType === 'Binary');
      if (binaryEntry?.resource?.id) {
        communication.payload = [
          {
            contentAttachment: {
              url: `Binary/${binaryEntry.resource.id}`,
              contentType: formData.file.type,
              title: formData.file.name,
            },
          },
        ];
      }

      // Update the Communication with the actual Practitioner reference
      const recipientEntry = result.entry?.find(
        (entry: BundleEntry) => entry.resource?.resourceType === 'Practitioner'
      );
      if (recipientEntry?.resource?.id) {
        communication.recipient = [{ reference: `Practitioner/${recipientEntry.resource.id}` }];
      }

      // Call the $send-efax operation with the Communication
      const sendResult = await medplum.post(medplum.fhirUrl('Communication', '$send-efax'), communication);

      showNotification({
        color: 'green',
        title: 'Success',
        message: `Fax queued successfully. ID: ${sendResult?.id}`,
      });

      navigate('/')?.catch(console.error);
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
          label="Recipient Name"
          placeholder="Enter recipient name"
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
