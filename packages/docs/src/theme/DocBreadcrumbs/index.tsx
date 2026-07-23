// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useDoc } from '@docusaurus/plugin-content-docs/client';
import GuideDownloads from '@site/src/components/GuideDownloads';
import OriginalDocBreadcrumbs from '@theme-original/DocBreadcrumbs';
import { type ReactNode } from 'react';
import styles from './styles.module.css';

export default function DocBreadcrumbsWrapper(): ReactNode {
  const { frontMatter } = useDoc();
  const downloadSlug = (frontMatter as { download_slug?: string }).download_slug;

  if (!downloadSlug) {
    return <OriginalDocBreadcrumbs />;
  }

  return (
    <div className={styles.row}>
      <OriginalDocBreadcrumbs />
      <GuideDownloads slug={downloadSlug} />
    </div>
  );
}
