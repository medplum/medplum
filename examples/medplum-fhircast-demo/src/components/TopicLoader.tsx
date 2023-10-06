import { Button, Input, Stack } from '@mantine/core';
import { useEffect, useState } from 'react';

interface TopicLoaderProps {
  onSetTopic: (topic: string | undefined) => void;
}
export default function TopicLoader(props: TopicLoaderProps): JSX.Element {
  const [topicInput, setTopicInput] = useState<string>('');
  const [topic, setTopic] = useState<string | undefined>();
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
          setTopicInput('');
          setTopic(undefined);
        }}
        size="compact-sm"
        fullWidth
      >
        Clear Topic
      </Button>
    </Stack>
  );
}
