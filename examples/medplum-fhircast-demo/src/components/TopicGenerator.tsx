import { useEffect, useState } from 'react';
import { usePrevious } from '../hooks';

interface TopicGeneratorProps {
  onTopicChange?: (topic: string | undefined) => void;
}

export default function TopicGenerator(props: TopicGeneratorProps): JSX.Element {
  const { onTopicChange } = props;
  const [syncing, setSyncing] = useState<boolean>(false);
  const [topic, setTopic] = useState<string | undefined>(undefined);
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
    <>
      <div>
        <button type="button" onClick={toggleSyncing}>
          {!syncing ? 'Sync subscribers' : 'Stop syncing subscribers'}
        </button>
      </div>
      {topic ? (
        <>
          <div>Topic ID: </div>
          <input type="text" value={topic ?? 'No topic'} onChange={() => {}} />
        </>
      ) : null}
    </>
  );
}
