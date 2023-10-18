import { Button, Input, Stack } from '@mantine/core';
import { useEffect, useState } from 'react';
import { usePrevious } from '../hooks';

interface TopicGeneratorProps {
  onTopicChange?: (topic: string | undefined) => void;
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
      <Button onClick={toggleSyncing} radius="xl" mb={20}>
        {!syncing ? 'Sync subscribers' : 'Stop syncing subscribers'}
      </Button>

      {topic ? (
        <>
          <Input.Wrapper label="Topic" w={350}>
            <Input value={topic ?? 'No topic'} />
          </Input.Wrapper>
        </>
      ) : null}
    </Stack>
  );
}
