import { useEffect, useState } from 'react';

interface TopicLoaderProps {
  onSetTopic: (topic: string | null) => void;
}
export default function TopicLoader(props: TopicLoaderProps): JSX.Element {
  const [topicInput, setTopicInput] = useState<string>('');
  const [topic, setTopic] = useState<string | null>(null);
  const { onSetTopic } = props;

  useEffect(() => {
    if (!onSetTopic) {
      return;
    }
    onSetTopic(topic);
  }, [onSetTopic, topic]);

  return (
    <div
      style={{
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        maxWidth: 300,
        justifyContent: 'center',
        paddingBottom: 20,
      }}
    >
      <input
        type="text"
        onChange={(e) => setTopicInput(e.target.value)}
        value={topicInput}
        style={{ marginBottom: 10 }}
      />
      <button
        type="button"
        onClick={() => {
          if (topicInput !== '') {
            setTopic(topicInput);
          }
        }}
        style={{ marginBottom: 10 }}
      >
        Subscribe to Topic
      </button>
      <button
        type="button"
        onClick={() => {
          setTopicInput('');
          setTopic(null);
        }}
      >
        Clear Topic
      </button>
    </div>
  );
}
