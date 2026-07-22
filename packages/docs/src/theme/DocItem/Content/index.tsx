// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useDoc } from '@docusaurus/plugin-content-docs/client';
import type { WrapperProps } from '@docusaurus/types';
import GuideDownloads from '@site/src/components/GuideDownloads';
import DocItemContent from '@theme-original/DocItem/Content';
import type ContentType from '@theme/DocItem/Content';
import { type ReactNode } from 'react';

type Props = WrapperProps<typeof ContentType>;

export default function ContentWrapper(props: Props): ReactNode {
  const { frontMatter } = useDoc();
  const downloadSlug = (frontMatter as { download_slug?: string }).download_slug;

  return (
    <>
      {downloadSlug && <GuideDownloads slug={downloadSlug} />}
      <DocItemContent {...props} />
    </>
  );
}
