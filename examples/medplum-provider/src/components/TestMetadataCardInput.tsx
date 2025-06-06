import { Card, Radio, Stack, Text, TextInput } from '@mantine/core';
import { LabOrderInputErrors, TestCoding } from '@medplum/health-gorilla-core';
import { TestMetadata, useHealthGorillaLabOrderContext } from '@medplum/health-gorilla-react';
import { QuestionnaireForm } from '@medplum/react';
import { JSX } from 'react';

export type TestMetadataCardInputProps = {
  test: TestCoding;
  metadata: TestMetadata | undefined;
  error?: NonNullable<LabOrderInputErrors['testMetadata']>[keyof NonNullable<LabOrderInputErrors['testMetadata']>];
};

export function TestMetadataCardInput({ test, metadata, error }: TestMetadataCardInputProps): JSX.Element {
  const { updateTestMetadata } = useHealthGorillaLabOrderContext();

  if (!metadata) {
    return (
      <Card key={test.code} withBorder shadow="none">
        <Text fw={500}>{test.display}</Text>
        <div>Missing metadata</div>
      </Card>
    );
  }

  return (
    <Card key={test.code} withBorder shadow="none">
      <Stack gap="xs">
        <Text fw={500}>{test.display}</Text>
        {!metadata ? (
          <div>Missing metadata</div>
        ) : (
          <>
            <Radio.Group
              value={metadata.priority}
              error={error?.priority?.message}
              onChange={(newValue) => {
                if (!newValue) {
                  console.warn('New value for priority unexpectedly falsey', newValue);
                  return;
                }
                const newPriority = newValue as TestMetadata['priority'];
                updateTestMetadata(test, { priority: newPriority });
              }}
              label="Priority"
              withAsterisk
            >
              <Stack gap={4}>
                <Radio value="routine" label="Routine" />
                <Radio value="urgent" label="Urgent" />
                <Radio value="asap" label="ASAP" />
                <Radio value="stat" label="Stat" />
              </Stack>
            </Radio.Group>

            <TextInput
              label="Notes"
              value={metadata.notes ?? ''}
              onChange={(event) => {
                updateTestMetadata(test, { notes: event.currentTarget.value });
              }}
              placeholder="Test notes"
            />

            {metadata.aoeStatus === 'loading' && <Text>Loading AoE...</Text>}
            {metadata.aoeStatus === 'error' && <Text>Error fetching AoE</Text>}
            {metadata.aoeStatus === 'loaded' && metadata.aoeQuestionnaire && (
              <>
                {error?.aoeResponses?.message && <Text c="red">{error.aoeResponses.message}</Text>}
                <QuestionnaireForm
                  questionnaire={metadata.aoeQuestionnaire}
                  disablePagination
                  excludeButtons
                  onChange={(qr) => {
                    updateTestMetadata(test, { aoeResponses: qr });
                  }}
                />
              </>
            )}
          </>
        )}
      </Stack>
    </Card>
  );
}
