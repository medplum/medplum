// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useRef, useState } from 'react';
import {
  useChat,
  useLocalParticipant,
  useParticipants,
  useIsMuted,
  useTracks,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import type { Participant } from 'livekit-client';

import styles from './MeetLayout.module.css';

/* ────────────────────────────────────────────────────────────────────── */
/*  Chat drawer                                                            */
/* ────────────────────────────────────────────────────────────────────── */

export interface ChatDrawerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Right-side slide-over chat panel backed by LiveKit's `useChat` hook.
 *
 * @param props - Component props.
 * @param props.open - Whether the drawer is visible.
 * @param props.onClose - Callback when user dismisses the drawer.
 * @returns Chat drawer UI.
 */
export function ChatDrawer({ open, onClose }: ChatDrawerProps): React.JSX.Element {
  const { chatMessages, send, isSending } = useChat();
  const { localParticipant } = useLocalParticipant();
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [open, chatMessages.length]);

  async function handleSend(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !send) {
      return;
    }
    try {
      await send(trimmed);
      setText('');
    } catch {
      /* best-effort */
    }
  }

  return (
    <aside className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`} aria-hidden={!open}>
      <header className={styles.drawerHeader}>
        <span>Chat</span>
        <button type="button" className={styles.drawerClose} onClick={onClose} aria-label="Close chat">
          ×
        </button>
      </header>

      <div className={styles.drawerBody} ref={listRef}>
        {chatMessages.length === 0 && (
          <p style={{ fontSize: 13, color: '#868e96', textAlign: 'center', padding: '24px 12px' }}>
            No messages yet. Say hello!
          </p>
        )}
        {chatMessages.map((m) => {
          const mine = m.from?.identity === localParticipant?.identity;
          return (
            <div
              key={m.id ?? `${m.timestamp}-${m.from?.identity}`}
              className={`${styles.chatMsg} ${mine ? styles.chatMsgSelf : ''}`}
            >
              <div className={styles.chatMsgMeta}>
                <span>{mine ? 'You' : m.from?.name || m.from?.identity || 'Participant'}</span>
                <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className={styles.chatMsgBody}>{m.message}</div>
            </div>
          );
        })}
      </div>

      <form className={styles.chatInput} onSubmit={handleSend}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          aria-label="Chat message"
        />
        <button type="submit" disabled={!text.trim() || isSending}>
          Send
        </button>
      </form>
    </aside>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Participants drawer                                                    */
/* ────────────────────────────────────────────────────────────────────── */

export interface ParticipantsDrawerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Right-side slide-over listing all connected participants with live
 * mic / cam state.
 *
 * @param props - Component props.
 * @param props.open - Whether the drawer is visible.
 * @param props.onClose - Callback when user dismisses the drawer.
 * @returns Participants drawer UI.
 */
export function ParticipantsDrawer({ open, onClose }: ParticipantsDrawerProps): React.JSX.Element {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  return (
    <aside className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`} aria-hidden={!open}>
      <header className={styles.drawerHeader}>
        <span>People ({participants.length})</span>
        <button type="button" className={styles.drawerClose} onClick={onClose} aria-label="Close people">
          ×
        </button>
      </header>
      <div className={styles.drawerBody}>
        {participants.map((p) => (
          <ParticipantRow key={p.identity} participant={p} isLocal={p.identity === localParticipant?.identity} />
        ))}
      </div>
    </aside>
  );
}

interface ParticipantRowProps {
  participant: Participant;
  isLocal: boolean;
}

function ParticipantRow({ participant, isLocal }: ParticipantRowProps): React.JSX.Element {
  const displayName = participant.name || participant.identity;
  const initials = getInitials(displayName);

  const trackRefs = useTracks([Track.Source.Camera, Track.Source.Microphone], { onlySubscribed: false });
  const micRef = trackRefs.find(
    (t) => t.participant.identity === participant.identity && t.source === Track.Source.Microphone
  );
  const camRef = trackRefs.find(
    (t) => t.participant.identity === participant.identity && t.source === Track.Source.Camera
  );

  const micMuted = useIsMuted(micRef ?? { participant, publication: undefined, source: Track.Source.Microphone });
  const camMuted = useIsMuted(camRef ?? { participant, publication: undefined, source: Track.Source.Camera });

  return (
    <div className={styles.participantRow}>
      <div className={styles.participantAvatar}>{initials}</div>
      <div className={styles.participantName}>
        {displayName}
        {isLocal && <span style={{ color: '#868e96', fontSize: 11, marginLeft: 6 }}>(you)</span>}
      </div>
      <div className={styles.participantMeta}>
        <span className={styles.participantIcon} data-state={micMuted ? 'off' : 'on'} title={micMuted ? 'Mic off' : 'Mic on'}>
          {micMuted ? '🔇' : '🎤'}
        </span>
        <span className={styles.participantIcon} data-state={camMuted ? 'off' : 'on'} title={camMuted ? 'Camera off' : 'Camera on'}>
          {camMuted ? '📷' : '📹'}
        </span>
      </div>
    </div>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export { getInitials };
