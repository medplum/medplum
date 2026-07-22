// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { IconLock } from '@tabler/icons-react';
import type { JSX } from 'react';
import styles from './WindowChrome.module.css';

export interface WindowChromeProps {
  /** Optional address-bar text; when set, a lock icon and the address are shown. */
  readonly address?: string;
}

/** The traffic-light dots and optional address bar shared by the product page's browser/app window mockups. */
export function WindowChrome(props: WindowChromeProps): JSX.Element {
  return (
    <div className={styles.bar}>
      <span className={`${styles.dot} ${styles.dotRed}`} />
      <span className={`${styles.dot} ${styles.dotYellow}`} />
      <span className={`${styles.dot} ${styles.dotGreen}`} />
      {props.address && (
        <span className={styles.address}>
          <IconLock size={10} stroke={2} aria-hidden />
          {props.address}
        </span>
      )}
    </div>
  );
}
