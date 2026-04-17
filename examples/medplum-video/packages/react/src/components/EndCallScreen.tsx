// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from 'react';

import styles from './MeetLayout.module.css';

export interface EndCallScreenProps {
  /** Who ended up in this state. Affects wording and CTAs. */
  role: 'provider' | 'patient' | 'observer';
  /** Optional rejoin callback (hidden if not provided). */
  onRejoin?: () => void;
  /** Optional callback when user wants to leave to dashboard / parent app. */
  onDismiss?: () => void;
  /** Optional feedback submission callback. */
  onFeedback?: (stars: number) => void;
}

/**
 * Post-visit overlay shown once the encounter transitions to `finished`.
 * Offers rejoin (if allowed), dismiss, and a simple 5-star feedback.
 *
 * @param props - Component props.
 * @param props.role - Viewer role.
 * @param props.onRejoin - Handler to rejoin the room (optional).
 * @param props.onDismiss - Handler to close the overlay / navigate away.
 * @param props.onFeedback - Handler invoked with the selected star count (1-5).
 * @returns End-of-call UI.
 */
export function EndCallScreen({ role, onRejoin, onDismiss, onFeedback }: EndCallScreenProps): React.JSX.Element {
  const [stars, setStars] = useState<number>(0);
  const [submitted, setSubmitted] = useState<boolean>(false);

  function handleRate(value: number): void {
    setStars(value);
    setSubmitted(true);
    try {
      onFeedback?.(value);
    } catch {
      /* best-effort */
    }
  }

  return (
    <div className={styles.endCall} role="dialog" aria-label="Visit ended">
      <div className={styles.endCallCard}>
        <h2 className={styles.endCallTitle}>
          {role === 'provider' ? 'Visit ended' : 'Thanks for visiting'}
        </h2>
        <p className={styles.endCallSub}>
          {role === 'provider'
            ? 'The encounter is now marked as finished.'
            : 'Your provider has ended the visit. We hope you feel better soon.'}
        </p>

        {!submitted ? (
          <>
            <p style={{ fontSize: 13, color: '#adb5bd', margin: 0 }}>How was your visit?</p>
            <div className={styles.stars} role="radiogroup" aria-label="Rate your visit">
              {[1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={stars >= i}
                  data-filled={stars >= i}
                  onClick={() => handleRate(i)}
                  onMouseEnter={() => setStars(i)}
                  onMouseLeave={() => setStars(0)}
                >
                  ★
                </button>
              ))}
            </div>
          </>
        ) : (
          <p style={{ color: '#8ce99a', fontSize: 13, margin: '16px 0' }}>
            Thanks for your feedback!
          </p>
        )}

        <div className={styles.endCallActions}>
          {onRejoin && (
            <button type="button" className={styles.endCallSecondary} onClick={onRejoin}>
              Rejoin
            </button>
          )}
          {onDismiss && (
            <button type="button" className={styles.endCallPrimary} onClick={onDismiss}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
