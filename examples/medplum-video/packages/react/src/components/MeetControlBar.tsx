// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  useDataChannel,
  useLocalParticipant,
  useMaybeLayoutContext,
  useRoomContext,
} from '@livekit/components-react';
import { Track } from 'livekit-client';

import styles from './MeetLayout.module.css';

const REACTION_EMOJI = ['👍', '👏', '❤️', '😂', '🎉', '🙌'] as const;
const REACTION_TOPIC = 'medplum-video-reactions';

type FlyingEmoji = { id: number; emoji: string; left: number };

export interface MeetControlBarProps {
  /** Role controls which buttons are available. */
  role: 'provider' | 'patient' | 'observer';
  /** Whether the chat drawer is currently open. */
  chatOpen: boolean;
  /** Toggle callback for chat drawer. */
  onToggleChat: () => void;
  /** Whether the participants drawer is currently open. */
  participantsOpen: boolean;
  /** Toggle callback for participants drawer. */
  onToggleParticipants: () => void;
  /** User clicked "End / Leave" — role determines the effective action. */
  onEnd: () => void | Promise<void>;
  /** Controls whether the bar is currently visible (auto-hide). */
  visible: boolean;
}

/**
 * Docked, glass-style bottom control bar inspired by Meet / Zoom.
 * Provides mic / cam / screen-share / reactions / chat / people / settings / end buttons.
 *
 * @param props - Component props.
 * @returns Control bar UI.
 */
export function MeetControlBar(props: MeetControlBarProps): React.JSX.Element {
  const {
    role,
    chatOpen,
    onToggleChat,
    participantsOpen,
    onToggleParticipants,
    onEnd,
    visible,
  } = props;

  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } =
    useLocalParticipant();
  const layout = useMaybeLayoutContext();

  const [reactionsOpen, setReactionsOpen] = useState<boolean>(false);
  const [flying, setFlying] = useState<FlyingEmoji[]>([]);
  const nextReactionId = useRef(0);

  const spawnEmoji = useCallback((emoji: string) => {
    const id = ++nextReactionId.current;
    const left = Math.round(20 + Math.random() * 60); // 20%..80%
    setFlying((f) => [...f, { id, emoji, left }]);
    setTimeout(() => {
      setFlying((f) => f.filter((e) => e.id !== id));
    }, 2600);
  }, []);

  const { send: sendData } = useDataChannel(REACTION_TOPIC, (msg) => {
    try {
      const text = new TextDecoder().decode(msg.payload);
      if (text) {
        spawnEmoji(text);
      }
    } catch {
      /* ignore malformed */
    }
  });

  const sendReaction = useCallback(
    (emoji: string) => {
      spawnEmoji(emoji);
      try {
        const payload = new TextEncoder().encode(emoji);
        void sendData(payload, { reliable: true });
      } catch {
        /* best-effort */
      }
      setReactionsOpen(false);
    },
    [sendData, spawnEmoji]
  );

  async function toggleMic(): Promise<void> {
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch {
      /* ignore */
    }
  }
  async function toggleCam(): Promise<void> {
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch {
      /* ignore */
    }
  }
  async function toggleScreen(): Promise<void> {
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
    } catch {
      /* ignore: user likely cancelled OS picker */
    }
  }
  function openSettings(): void {
    layout?.widget.dispatch?.({ msg: 'toggle_settings' });
  }

  const canScreenShare = role === 'provider' || role === 'patient';
  const canInteract = role !== 'observer';

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && reactionsOpen) {
        setReactionsOpen(false);
      }
    }
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [reactionsOpen]);

  return (
    <>
      {/* Flying-emoji overlay */}
      <div className={styles.reactionsLayer} aria-hidden="true">
        {flying.map((e) => (
          <span key={e.id} className={styles.flyingEmoji} style={{ left: `${e.left}%` }}>
            {e.emoji}
          </span>
        ))}
      </div>

      {/* Reaction picker (above control bar) */}
      {reactionsOpen && (
        <div className={styles.reactionsPicker} role="toolbar" aria-label="Send a reaction">
          {REACTION_EMOJI.map((em) => (
            <button key={em} type="button" onClick={() => sendReaction(em)} aria-label={`Send ${em}`}>
              {em}
            </button>
          ))}
        </div>
      )}

      {/* Control bar */}
      <div
        className={`${styles.controlBarWrap} ${!visible ? styles.controlBarHidden : ''}`}
        data-visible={visible}
      >
        <div className={styles.controlBar} role="toolbar" aria-label="Call controls">
          {canInteract && (
            <button
              type="button"
              className={`${styles.ctrlBtn} ${styles.ctrlTooltip}`}
              data-off={!isMicrophoneEnabled}
              data-tip={isMicrophoneEnabled ? 'Mute (⌘⇧A)' : 'Unmute (⌘⇧A)'}
              aria-label={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
              onClick={() => void toggleMic()}
            >
              {isMicrophoneEnabled ? '🎤' : '🔇'}
            </button>
          )}

          {canInteract && (
            <button
              type="button"
              className={`${styles.ctrlBtn} ${styles.ctrlTooltip}`}
              data-off={!isCameraEnabled}
              data-tip={isCameraEnabled ? 'Camera off (⌘⇧V)' : 'Camera on (⌘⇧V)'}
              aria-label={isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}
              onClick={() => void toggleCam()}
            >
              {isCameraEnabled ? '📹' : '📷'}
            </button>
          )}

          {canScreenShare && (
            <button
              type="button"
              className={`${styles.ctrlBtn} ${styles.ctrlTooltip}`}
              data-active={isScreenShareEnabled}
              data-tip={isScreenShareEnabled ? 'Stop sharing' : 'Share screen'}
              aria-label={isScreenShareEnabled ? 'Stop screen share' : 'Start screen share'}
              onClick={() => void toggleScreen()}
            >
              🖥
            </button>
          )}

          {canInteract && (
            <button
              type="button"
              className={`${styles.ctrlBtn} ${styles.ctrlTooltip}`}
              data-active={reactionsOpen}
              data-tip="Reactions"
              aria-label="Send a reaction"
              onClick={() => setReactionsOpen((v) => !v)}
            >
              🙂
            </button>
          )}

          <span className={styles.ctrlDivider} />

          <button
            type="button"
            className={`${styles.ctrlBtn} ${styles.ctrlTooltip}`}
            data-active={chatOpen}
            data-tip="Chat"
            aria-label="Toggle chat"
            onClick={onToggleChat}
          >
            💬
          </button>

          <button
            type="button"
            className={`${styles.ctrlBtn} ${styles.ctrlTooltip}`}
            data-active={participantsOpen}
            data-tip="People"
            aria-label="Toggle participants"
            onClick={onToggleParticipants}
          >
            👥
          </button>

          {canInteract && (
            <button
              type="button"
              className={`${styles.ctrlBtn} ${styles.ctrlTooltip}`}
              data-tip="Settings"
              aria-label="Settings"
              onClick={openSettings}
            >
              ⚙
            </button>
          )}

          <span className={styles.ctrlDivider} />

          <button
            type="button"
            className={styles.ctrlBtn}
            data-danger={true}
            data-wide={true}
            aria-label={role === 'provider' ? 'End visit for all' : 'Leave visit'}
            onClick={() => {
              try {
                void room?.disconnect?.();
              } catch {
                /* ignore */
              }
              void onEnd();
            }}
          >
            {role === 'provider' ? 'End' : 'Leave'}
          </button>
        </div>
      </div>
    </>
  );
}

export { REACTION_TOPIC };
