import { Card, Radio, Stack, Text, TextInput } from '@mantine/core';
import { TestCoding, TestMetadata, useHealthGorillaLabOrderContext } from '@medplum-ee/hg-client';
import { QuestionnaireForm } from '@medplum/react';

export type TestMetadataCardInputProps = { test: TestCoding; metadata: TestMetadata | undefined };

export function TestMetadataCardInput({ test, metadata }: TestMetadataCardInputProps): JSX.Element {
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
              value={metadata.notes}
              onChange={(event) => {
                updateTestMetadata(test, { notes: event.currentTarget.value });
              }}
              placeholder="Test notes"
            />

            {metadata.aoeStatus === 'loading' && <Text>Loading AoE...</Text>}
            {metadata.aoeStatus === 'error' && <Text>Error fetching AoE</Text>}
            {metadata.aoeStatus === 'loaded' && metadata.aoeQuestionnaire && (
              <QuestionnaireForm
                questionnaire={metadata.aoeQuestionnaire}
                disablePagination
                excludeButtons
                onChange={(qr) => {
                  updateTestMetadata(test, { aoeResponses: qr });
                }}
              />
            )}
          </>
        )}
      </Stack>
    </Card>
  );
}
