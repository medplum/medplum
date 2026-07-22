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
      <a className={styles.downloadButton} href={`/decision-guides/${slug}.pdf`} download>
        <IconDownload size={18} />
        Download PDF
      </a>
      <a className={styles.downloadButton} href={`/decision-guides/${slug}.docx`} download>
        <IconDownload size={18} />
        Download Word
      </a>
    </div>
  );
}
