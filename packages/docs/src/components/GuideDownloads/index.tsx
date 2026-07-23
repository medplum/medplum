// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { IconDownload } from '@tabler/icons-react';
import { type ReactNode } from 'react';
import styles from './styles.module.css';

export interface GuideDownloadsProps {
  slug: string;
}

export default function GuideDownloads({ slug }: GuideDownloadsProps): ReactNode {
  return (
    <div className={styles.downloads}>
      <span className={styles.label}>Download:</span>
      <a className={styles.downloadLink} href={`/decision-guides/${slug}.pdf`} download>
        <IconDownload size={14} />
        PDF
      </a>
      <span className={styles.divider} aria-hidden="true">
        ·
      </span>
      <a className={styles.downloadLink} href={`/decision-guides/${slug}.docx`} download>
        <IconDownload size={14} />
        Word
      </a>
    </div>
  );
}
