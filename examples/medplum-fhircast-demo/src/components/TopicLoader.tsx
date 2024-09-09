import { Button, Input, Stack } from '@mantine/core';
import { useEffect, useState } from 'react';

interface TopicLoaderProps {
  readonly onSetTopic: (topic: string | undefined) => void;
}
export default function TopicLoader(props: TopicLoaderProps): JSX.Element {
  const [topicInput, setTopicInput] = useState<string>('');
  const [topic, setTopic] = useState<string>();
  const { onSetTopic } = props;

  useEffect(() => {
    if (!onSetTopic) {
      return;
    }
    onSetTopic(topic);
  }, [onSetTopic, topic]);

  return (
    <Stack align="center">
      <Input.Wrapper label="Topic">
        <Input type="text" onChange={(e) => setTopicInput(e.target.value)} value={topicInput} w={350} />
      </Input.Wrapper>
      <Button
        type="button"
        onClick={() => {
          setTopicInput('');
          setTopic(undefined);
        }}
        size="compact-sm"
        fullWidth
        disabled={!topicInput}
      >
        Clear Topic Input
      </Button>
      <Button
        type="button"
        onClick={() => {
          if (topicInput !== '') {
            setTopic(topicInput);
          }
        }}
        size="compact-sm"
        fullWidth
      >
        Subscribe to Topic
      </Button>
      <Button
        type="button"
        onClick={() => {
          if (topic) {
            setTopic(undefined);
          }
        }}
        disabled={!topic}
        size="compact-sm"
        fullWidth
      >
        Unsubscribe from Topic
      </Button>
    </Stack>
  );
}
