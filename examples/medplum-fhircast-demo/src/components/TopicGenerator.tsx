import { Button, Stack, TextInput } from '@mantine/core';
import { usePrevious } from '@medplum/react';
import { useEffect, useState } from 'react';

interface TopicGeneratorProps {
  readonly onTopicChange?: (topic: string | undefined) => void;
}

export default function TopicGenerator(props: TopicGeneratorProps): JSX.Element {
  const { onTopicChange } = props;
  const [syncing, setSyncing] = useState<boolean>(false);
  const [topic, setTopic] = useState<string>();
  const prevTopic = usePrevious(topic);

  useEffect(() => {
    if (!onTopicChange) {
      return;
    }

    if (prevTopic !== topic) {
      onTopicChange(topic);
    }
  }, [onTopicChange, prevTopic, topic]);

  useEffect(() => {
    if (!syncing) {
      setTopic(undefined);
    } else {
      setTopic(crypto.randomUUID());
    }
  }, [syncing]);

  const toggleSyncing = (): void => {
    setSyncing(!syncing);
  };

  return (
    <Stack align="center">
      <Button onClick={toggleSyncing} mb={20}>
        {!syncing ? 'Sync subscribers' : 'Stop syncing subscribers'}
      </Button>
      {topic ? <TextInput label="Topic" value={topic ?? 'No topic'} readOnly w={350} /> : null}
    </Stack>
  );
}
