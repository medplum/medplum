import { Button, Textarea } from '@mantine/core';
import { IconMessageChatbot, IconSend } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import classes from './RightPanel.module.css';

/**
 * Placeholder chat panel for the AI agent. In Phase 1 this is UI-only;
 * in a future phase it will be wired to Claude API or a Medplum Bot.
 */
export function ChatPanel(): JSX.Element {
  const [message, setMessage] = useState('');

  return (
    <div className={classes.chatContainer}>
      <div className={classes.chatMessages}>
        <div className={classes.chatEmpty}>
          <IconMessageChatbot size={40} stroke={1.2} className={classes.chatEmptyIcon} />
          <span style={{ fontWeight: 500, fontSize: 14 }}>AI Assistant</span>
          <span style={{ fontSize: 13 }}>
            Ask me to make changes to your app — update colors, rearrange sections, add components, and more.
          </span>
        </div>
      </div>
      <div className={classes.chatInputArea}>
        <Textarea
          placeholder="Ask for changes..."
          size="sm"
          autosize
          minRows={1}
          maxRows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rightSection={
            <Button
              variant="subtle"
              size="compact-xs"
              color="gray"
              disabled={!message.trim()}
              onClick={() => setMessage('')}
            >
              <IconSend size={16} />
            </Button>
          }
          rightSectionWidth={40}
        />
      </div>
    </div>
  );
}
