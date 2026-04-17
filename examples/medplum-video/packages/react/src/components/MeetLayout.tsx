// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutContext,
  useCreateLayoutContext,
  useLocalParticipant,
  useIsMuted,
  useIsSpeaking,
  useRemoteParticipants,
  useTracks,
  VideoTrack,
} from '@livekit/components-react';
import type { TrackReference, TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { Track } from 'livekit-client';
import type { Participant } from 'livekit-client';

import styles from './MeetLayout.module.css';
import { ChatDrawer, ParticipantsDrawer, getInitials } from './MeetDrawers';
import { MeetControlBar } from './MeetControlBar';
import { EndCallScreen } from './EndCallScreen';
import { SettingsMenu } from './SettingsMenu';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface MeetLayoutProps {
  /** Viewer role. Controls which controls are available. */
  role: 'provider' | 'patient' | 'observer';
  /**
   * Callback when the user ends / leaves the call via the control bar.
   * For providers this typically finishes the encounter; for patients it
   * just disconnects.
   */
  onEnd?: () => void | Promise<void>;
  /** Show the end-of-call overlay. Toggle on when encounter.status === 'finished'. */
  ended?: boolean;
  /** Callback when user clicks "Close" in the end-call overlay. */
  onDismissEnd?: () => void;
  /** Optional rejoin callback for the end-call overlay (e.g. reopen tab). */
  onRejoin?: () => void;
  /** Optional feedback hook. */
  onFeedback?: (stars: number) => void;
}

/**
 * Meet-style 1:1 layout:
 *
 * - Single remote: centered, letterboxed, 16:9 focus tile. Self-view is a
 *   draggable picture-in-picture in a corner.
 * - Two remotes (rare for telehealth): primary speaker focused, other in strip.
 * - Screen share active: screen becomes the focus, camera tiles drop to a
 *   bottom strip.
 * - No remote yet: friendly "waiting for …" card with self-PIP.
 *
 * Controls auto-hide on pointer / touch inactivity, and the whole frame
 * reacts to `click` / `keydown` to reveal them.
 *
 * @param props - Component props.
 * @returns The full stage (excluding LiveKitRoom wrapper).
 */
export function MeetLayout(props: MeetLayoutProps): React.JSX.Element {
  const { role, onEnd, ended, onDismissEnd, onRejoin, onFeedback } = props;

  const layoutContext = useCreateLayoutContext();
  const remotes = useRemoteParticipants();
  const { localParticipant } = useLocalParticipant();

  const [chatOpen, setChatOpen] = useState<boolean>(false);
  const [participantsOpen, setParticipantsOpen] = useState<boolean>(false);
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  const [selfCorner, setSelfCorner] = useState<Corner>('bottom-right');
  const [focusIdentity, setFocusIdentity] = useState<string | null>(null);

  // All tracks we care about — camera + screenshare, inclusive of muted.
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const screenShareRef = useMemo(
    () => tracks.find((t) => t.source === Track.Source.ScreenShare && t.publication),
    [tracks]
  );

  const remoteCamTracks = useMemo(
    () =>
      tracks.filter(
        (t) =>
          t.source === Track.Source.Camera && t.participant.identity !== localParticipant?.identity
      ),
    [tracks, localParticipant]
  );

  const localCamTrack = useMemo(
    () =>
      tracks.find(
        (t) =>
          t.source === Track.Source.Camera && t.participant.identity === localParticipant?.identity
      ),
    [tracks, localParticipant]
  );

  // Which remote participant is "focused" (speaker). Sticky on active speaker.
  const speakerIdentity = useActiveSpeakerIdentity(remotes);
  const effectiveFocusIdentity =
    focusIdentity ?? speakerIdentity ?? remoteCamTracks[0]?.participant.identity ?? null;

  const focusCamRef = useMemo(
    () =>
      remoteCamTracks.find((t) => t.participant.identity === effectiveFocusIdentity) ??
      remoteCamTracks[0],
    [remoteCamTracks, effectiveFocusIdentity]
  );

  // Strip tiles — everyone NOT currently in focus (and not screen share).
  const stripRefs = useMemo(() => {
    if (screenShareRef) {
      // When screen-sharing, put ALL camera tiles (including other remotes) in the strip.
      return remoteCamTracks;
    }
    // Otherwise only "the other ones" go into the strip.
    return remoteCamTracks.filter((t) => t.participant.identity !== focusCamRef?.participant.identity);
  }, [remoteCamTracks, focusCamRef, screenShareRef]);

  // Focus the screen share when someone starts sharing; clear when it stops.
  useEffect(() => {
    if (screenShareRef) {
      setFocusIdentity(null); // focus implicitly = screenshare
    }
  }, [screenShareRef?.publication?.trackSid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-hide controls after 4s of inactivity while connected.
  const hideTimerRef = useRef<number | null>(null);
  const resetHideTimer = (): void => {
    setControlsVisible(true);
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), 4000);
  };
  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close one drawer when opening the other (they can't coexist at this width).
  function toggleChat(): void {
    setChatOpen((v) => !v);
    setParticipantsOpen(false);
  }
  function toggleParticipants(): void {
    setParticipantsOpen((v) => !v);
    setChatOpen(false);
  }

  const hasRemote = remotes.length > 0;

  return (
    <LayoutContext.Provider value={layoutContext}>
      <div
        className={styles.root}
        onMouseMove={resetHideTimer}
        onTouchStart={resetHideTimer}
        onKeyDown={resetHideTimer}
        onClick={resetHideTimer}
      >
        {/* STAGE ------------------------------------------------------ */}
        <div className={`${styles.stage} ${screenShareRef ? styles.stageWithStrip : ''}`}>
          {screenShareRef ? (
            <>
              <FocusTile trackRef={screenShareRef} isScreenShare={true} />
              <CamStrip
                refs={[
                  ...(focusCamRef ? [focusCamRef] : []),
                  ...remoteCamTracks.filter(
                    (t) => t.participant.identity !== focusCamRef?.participant.identity
                  ),
                ]}
                onPick={(ident) => setFocusIdentity(ident)}
              />
            </>
          ) : hasRemote && focusCamRef ? (
            <>
              <FocusTile trackRef={focusCamRef} />
              {stripRefs.length > 0 && (
                <CamStrip refs={stripRefs} onPick={(ident) => setFocusIdentity(ident)} />
              )}
            </>
          ) : (
            <WaitingForRemote role={role} />
          )}
        </div>

        {/* SELF-VIEW PIP --------------------------------------------- */}
        {localCamTrack && (hasRemote || screenShareRef) && (
          <SelfPip
            trackRef={localCamTrack}
            corner={selfCorner}
            onCornerChange={setSelfCorner}
            displayName={localParticipant?.name || localParticipant?.identity || 'You'}
          />
        )}

        {/* DRAWERS ---------------------------------------------------- */}
        <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
        <ParticipantsDrawer open={participantsOpen} onClose={() => setParticipantsOpen(false)} />

        {/* CONTROLS --------------------------------------------------- */}
        <MeetControlBar
          role={role}
          visible={controlsVisible || chatOpen || participantsOpen}
          chatOpen={chatOpen}
          onToggleChat={toggleChat}
          participantsOpen={participantsOpen}
          onToggleParticipants={toggleParticipants}
          onEnd={() => onEnd?.()}
        />

        {/* Settings panel (via LK layoutContext widget) --------------- */}
        {layoutContext.widget.state?.showSettings && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              right: 12,
              maxWidth: 420,
              background: '#1a1b1e',
              color: '#e9ecef',
              borderRadius: 14,
              zIndex: 60,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            <SettingsMenu />
          </div>
        )}

        {/* END CALL OVERLAY ------------------------------------------ */}
        {ended && (
          <EndCallScreen
            role={role}
            onDismiss={onDismissEnd}
            onRejoin={onRejoin}
            onFeedback={onFeedback}
          />
        )}
      </div>
    </LayoutContext.Provider>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Focus tile                                                             */
/* ────────────────────────────────────────────────────────────────────── */

interface FocusTileProps {
  trackRef: TrackReferenceOrPlaceholder;
  isScreenShare?: boolean;
}

function FocusTile({ trackRef, isScreenShare }: FocusTileProps): React.JSX.Element {
  const participant = trackRef.participant;
  const camMuted = useIsMuted(trackRef);
  const isSpeaking = useIsSpeaking(participant);
  const displayName = participant.name || participant.identity;

  return (
    <div
      className={styles.focusTile}
      data-speaking={isSpeaking ? 'true' : 'false'}
      style={isSpeaking ? { boxShadow: '0 0 0 3px #339af0, 0 8px 32px rgba(0,0,0,0.45)' } : undefined}
    >
      {trackRef.publication && !camMuted ? (
        <VideoTrack trackRef={trackRef as TrackReference} />
      ) : (
        <div className={styles.focusTilePlaceholder}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div className={styles.avatar}>{getInitials(displayName)}</div>
            <span>{displayName}</span>
          </div>
        </div>
      )}

      {isScreenShare && (
        <div className={styles.focusTileBadgeTop}>
          <span className={`${styles.badgePill} ${styles.live}`}>● {displayName} · Sharing</span>
        </div>
      )}

      <div className={styles.focusTileOverlay}>
        <span>{displayName}</span>
        {camMuted && !isScreenShare && <span className={styles.mutedIcon}>🔇</span>}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Cam strip                                                              */
/* ────────────────────────────────────────────────────────────────────── */

interface CamStripProps {
  refs: TrackReferenceOrPlaceholder[];
  onPick: (identity: string) => void;
}

function CamStrip({ refs, onPick }: CamStripProps): React.JSX.Element {
  return (
    <div className={styles.camStrip} role="list">
      {refs.map((ref) => (
        <StripTile key={`${ref.participant.identity}:${ref.source}`} trackRef={ref} onPick={onPick} />
      ))}
    </div>
  );
}

function StripTile({ trackRef, onPick }: { trackRef: TrackReferenceOrPlaceholder; onPick: (id: string) => void }): React.JSX.Element {
  const muted = useIsMuted(trackRef);
  const displayName = trackRef.participant.name || trackRef.participant.identity;
  return (
    <button
      type="button"
      className={styles.stripTile}
      onClick={() => onPick(trackRef.participant.identity)}
      aria-label={`Focus ${displayName}`}
    >
      {trackRef.publication && !muted ? (
        <VideoTrack trackRef={trackRef as TrackReference} />
      ) : (
        <div className={styles.focusTilePlaceholder}>
          <div className={styles.avatar} style={{ width: 48, height: 48, fontSize: 20 }}>
            {getInitials(displayName)}
          </div>
        </div>
      )}
      <span className={styles.stripTileName}>{displayName}</span>
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Self-view picture-in-picture                                           */
/* ────────────────────────────────────────────────────────────────────── */

interface SelfPipProps {
  trackRef: TrackReferenceOrPlaceholder;
  displayName: string;
  corner: Corner;
  onCornerChange: (c: Corner) => void;
}

function SelfPip({ trackRef, displayName, corner, onCornerChange }: SelfPipProps): React.JSX.Element {
  const muted = useIsMuted(trackRef);
  const pipRef = useRef<HTMLDivElement | null>(null);

  // Corner-snap drag: we drag freely, then snap to the closest viewport corner on release.
  useEffect(() => {
    const node = pipRef.current;
    if (!node) {
      return undefined;
    }

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    function onDown(e: PointerEvent): void {
      dragging = true;
      node?.setPointerCapture?.(e.pointerId);
      const rect = node!.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      originX = rect.left;
      originY = rect.top;
      node!.style.transition = 'none';
    }
    function onMove(e: PointerEvent): void {
      if (!dragging || !node) {
        return;
      }
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      node.style.left = `${originX + dx}px`;
      node.style.top = `${originY + dy}px`;
      node.style.right = 'auto';
      node.style.bottom = 'auto';
    }
    function onUp(): void {
      if (!dragging || !node) {
        return;
      }
      dragging = false;
      node.style.transition = '';

      const rect = node.getBoundingClientRect();
      const parent = node.offsetParent as HTMLElement | null;
      if (!parent) {
        return;
      }
      const prect = parent.getBoundingClientRect();
      const cx = rect.left + rect.width / 2 - prect.left;
      const cy = rect.top + rect.height / 2 - prect.top;

      const isLeft = cx < prect.width / 2;
      const isTop = cy < prect.height / 2;
      const next: Corner =
        isTop && isLeft ? 'top-left' : isTop ? 'top-right' : isLeft ? 'bottom-left' : 'bottom-right';

      // Reset inline positioning — the stylesheet / className below re-applies it.
      node.style.left = '';
      node.style.top = '';
      node.style.right = '';
      node.style.bottom = '';
      onCornerChange(next);
    }

    node.addEventListener('pointerdown', onDown);
    globalThis.addEventListener('pointermove', onMove);
    globalThis.addEventListener('pointerup', onUp);
    globalThis.addEventListener('pointercancel', onUp);
    return () => {
      node.removeEventListener('pointerdown', onDown);
      globalThis.removeEventListener('pointermove', onMove);
      globalThis.removeEventListener('pointerup', onUp);
      globalThis.removeEventListener('pointercancel', onUp);
    };
  }, [onCornerChange]);

  const positionStyle: React.CSSProperties = (() => {
    const pad = 16;
    switch (corner) {
      case 'top-left':     return { top: pad,    left: pad };
      case 'top-right':    return { top: pad,    right: pad };
      case 'bottom-left':  return { bottom: 110, left: pad };
      case 'bottom-right':
      default:             return { bottom: 110, right: pad };
    }
  })();

  return (
    <div
      ref={pipRef}
      className={styles.selfPip}
      style={positionStyle}
      aria-label="Your camera (drag to reposition)"
    >
      {trackRef.publication && !muted ? (
        <VideoTrack trackRef={trackRef as TrackReference} />
      ) : (
        <div className={styles.selfPipOff}>Camera off</div>
      )}
      <span className={styles.selfPipLabel}>{displayName}</span>
      {muted && <span className={styles.selfPipMuted}>🔇</span>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Empty state                                                            */
/* ────────────────────────────────────────────────────────────────────── */

function WaitingForRemote({ role }: { role: 'provider' | 'patient' | 'observer' }): React.JSX.Element {
  const heading = role === 'provider' ? 'Waiting for the patient to join…' : 'Waiting for the provider…';
  const sub =
    role === 'provider'
      ? 'They’ll appear here as soon as they connect. Feel free to get set up.'
      : 'Your provider will join shortly. Make sure your camera and microphone are working.';

  return (
    <div className={styles.waitingCard}>
      <div style={{ fontSize: 42 }} aria-hidden="true">🩺</div>
      <h2 className={styles.waitingTitle}>{heading}</h2>
      <p className={styles.waitingSub}>{sub}</p>
      <div className={styles.waitingDots} aria-hidden="true">
        <span /> <span /> <span />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Track the "most recent active speaker" identity across renders so the
 * focused tile doesn't flicker when people briefly stop speaking.
 */
function useActiveSpeakerIdentity(participants: Participant[]): string | null {
  const [ident, setIdent] = useState<string | null>(null);

  useEffect(() => {
    for (const p of participants) {
      if (p.isSpeaking) {
        setIdent(p.identity);
        return;
      }
    }
  }, [participants.map((p) => `${p.identity}:${p.isSpeaking}`).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return ident;
}
