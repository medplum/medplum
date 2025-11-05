// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Paper, Stack, Text, Group, Badge, Divider } from '@mantine/core';
import { formatDate, formatHumanName } from '@medplum/core';
import type { DiagnosticReport, HumanName } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useResource, ObservationTable } from '@medplum/react';

interface LabResultDetailsProps {
  result: DiagnosticReport;
  onResultChange?: (result: DiagnosticReport) => void;
}

export function LabResultDetails({ result, onResultChange: _onResultChange }: LabResultDetailsProps): JSX.Element {
  const patient = useResource(result.subject);
  const performer = useResource(result.performer?.[0]);

  const getStatusColor = (status: string | undefined): string => {
    switch (status) {
      case 'final':
        return 'green';
      case 'partial':
        return 'yellow';
      case 'preliminary':
        return 'blue';
      case 'cancelled':
      case 'entered-in-error':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getStatusDisplayText = (status: string | undefined): string => {
    switch (status) {
      case 'final':
        return 'Final';
      case 'partial':
        return 'Partial';
      case 'preliminary':
        return 'Preliminary';
      case 'cancelled':
        return 'Cancelled';
      case 'entered-in-error':
        return 'Error';
      default:
        return status || 'Unknown';
    }
  };

  return (
    <Paper h="100%" p="md" style={{ overflow: 'auto' }}>
      <Stack gap="md">
        <Stack gap="xs">
          <Text size="xl" fw={700}>
            {result.code?.text || result.code?.coding?.[0]?.display || 'Lab Result'}
          </Text>
          <Badge size="lg" color={getStatusColor(result.status)} variant="light">
            {getStatusDisplayText(result.status)}
          </Badge>
        </Stack>

        <Divider />

        <Stack gap="sm">
          <Text fw={600} size="sm" c="dimmed">
            RESULT DETAILS
          </Text>

          <Group>
            <Text fw={500} size="sm">
              Issued Date:
            </Text>
            <Text size="sm">{formatDate(result.issued)}</Text>
          </Group>

          {result.effectiveDateTime && (
            <Group>
              <Text fw={500} size="sm">
                Effective Date:
              </Text>
              <Text size="sm">{formatDate(result.effectiveDateTime)}</Text>
            </Group>
          )}

          {result.code?.coding && (
            <Group align="flex-start">
              <Text fw={500} size="sm">
                Test Code:
              </Text>
              <Stack gap="xs">
                {result.code.coding.map((coding, index) => (
                  <Group key={index} gap="xs">
                    <Badge size="sm" variant="outline">
                      {coding.code}
                    </Badge>
                    <Text size="sm">{coding.display}</Text>
                  </Group>
                ))}
              </Stack>
            </Group>
          )}

          {performer?.resourceType === 'Practitioner' && (
            <Group>
              <Text fw={500} size="sm">
                Performed by:
              </Text>
              <Text size="sm">{formatHumanName(performer.name?.[0] as HumanName)}</Text>
            </Group>
          )}

          {patient?.resourceType === 'Patient' && (
            <Group>
              <Text fw={500} size="sm">
                Patient:
              </Text>
              <Text size="sm">{formatHumanName(patient.name?.[0] as HumanName)}</Text>
            </Group>
          )}

          {result.category && (
            <Group align="flex-start">
              <Text fw={500} size="sm">
                Category:
              </Text>
              <Stack gap="xs">
                {result.category.map((category, index) => (
                  <Text key={index} size="sm">
                    {category.text || category.coding?.[0]?.display}
                  </Text>
                ))}
              </Stack>
            </Group>
          )}
        </Stack>

        {result.conclusion && (
          <>
            <Divider />
            <Stack gap="sm">
              <Text fw={600} size="sm" c="dimmed">
                CONCLUSION
              </Text>
              <Text size="sm">{result.conclusion}</Text>
            </Stack>
          </>
        )}

        {result.conclusionCode && (
          <>
            <Divider />
            <Stack gap="sm">
              <Text fw={600} size="sm" c="dimmed">
                CONCLUSION CODES
              </Text>
              {result.conclusionCode.map((code, index) => (
                <Group key={index} align="flex-start">
                  <Text fw={500} size="sm">
                    Code {index + 1}:
                  </Text>
                  <Text size="sm">{code.text || code.coding?.[0]?.display}</Text>
                </Group>
              ))}
            </Stack>
          </>
        )}

        {result.presentedForm && (
          <>
            <Divider />
            <Stack gap="sm">
              <Text fw={600} size="sm" c="dimmed">
                ATTACHMENTS
              </Text>
              {result.presentedForm.map((form, index) => (
                <Group key={index} align="flex-start">
                  <Text fw={500} size="sm">
                    Attachment {index + 1}:
                  </Text>
                  <Text size="sm">{form.title || form.contentType || 'Attachment'}</Text>
                </Group>
              ))}
            </Stack>
          </>
        )}

        {result.result && result.result.length > 0 && (
          <>
            <Divider />
            <Stack gap="sm">
              <Text fw={600} size="sm" c="dimmed">
                TEST RESULTS
              </Text>
              <ObservationTable value={result.result} hideObservationNotes={false} />
            </Stack>
          </>
        )}
      </Stack>
    </Paper>
  );
}
