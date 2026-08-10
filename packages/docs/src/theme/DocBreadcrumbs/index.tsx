// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useDoc } from '@docusaurus/plugin-content-docs/client';
import GuideDownloads from '@site/src/components/GuideDownloads';
import OriginalDocBreadcrumbs from '@theme-original/DocBreadcrumbs';
import { type ReactNode } from 'react';
import styles from './styles.module.css';

export default function DocBreadcrumbsWrapper(): ReactNode {
  // DocBreadcrumbs isn't only rendered on regular doc pages — Docusaurus also
  // renders it on auto-generated category index pages (sidebars.ts entries
  // with `type: 'generated-index'`, e.g. the API reference categories),
  // which aren't wrapped in the DocProvider context useDoc() needs. Calling
  // it there throws and fails the whole site build, so guard it: those pages
  // never have a download_slug anyway.
  let downloadSlug: string | undefined;
  try {
    const { frontMatter } = useDoc();
    downloadSlug = (frontMatter as { download_slug?: string }).download_slug;
  } catch {
    downloadSlug = undefined;
  }

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
