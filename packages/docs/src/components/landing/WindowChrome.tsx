// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { IconLock } from '@tabler/icons-react';
import clsx from 'clsx';
import type { JSX } from 'react';
import styles from './WindowChrome.module.css';

export interface WindowChromeProps {
  /** Optional address-bar text; when set, a lock icon and the address are shown. */
  readonly address?: string;
  /**
   * When true, the traffic lights render as neutral grey dots on the page surface.
   * Used where the frame is a quiet container for someone else's product screenshot
   * and the macOS red/yellow/green would pull focus.
   */
  readonly monochrome?: boolean;
}

/**
 * The traffic-light dots and optional address bar shared by the marketing pages'
 * browser/app window mockups.
 *
 * @param props - The optional address text and colour treatment.
 * @returns The chrome bar.
 */
export function WindowChrome(props: WindowChromeProps): JSX.Element {
  return (
    <div className={clsx(styles.bar, props.monochrome && styles.barMonochrome)}>
      <span className={clsx(styles.dot, !props.monochrome && styles.dotRed)} />
      <span className={clsx(styles.dot, !props.monochrome && styles.dotYellow)} />
      <span className={clsx(styles.dot, !props.monochrome && styles.dotGreen)} />
      {props.address && (
        <span className={styles.address}>
          <IconLock size={10} stroke={2} aria-hidden />
          {props.address}
        </span>
      )}
    </div>
  );
}
