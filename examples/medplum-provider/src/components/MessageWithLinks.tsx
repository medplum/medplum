// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Text, Anchor } from '@mantine/core';
import type { JSX } from 'react';

interface MessageWithLinksProps {
  content: string;
}

export function MessageWithLinks({ content }: MessageWithLinksProps): JSX.Element {
  const resourcePattern = /\b([A-Z][a-zA-Z]+)\/([a-zA-Z0-9-]+)\b/g;

  const parts: JSX.Element[] = [];
  let lastIndex = 0;
  let match;

  while ((match = resourcePattern.exec(content)) !== null) {
    const [fullMatch, resourceType, resourceId] = match;
    const matchIndex = match.index;

    if (matchIndex > lastIndex) {
      parts.push(<span key={`text-${lastIndex}`}>{content.substring(lastIndex, matchIndex)}</span>);
    }

    const href = `/${resourceType}/${resourceId}`;
    parts.push(
      <Anchor
        key={`link-${matchIndex}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        c="#7c3aed"
        style={{ fontWeight: 500 }}
      >
        {fullMatch}
      </Anchor>
    );

    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < content.length) {
    parts.push(<span key={`text-${lastIndex}`}>{content.substring(lastIndex)}</span>);
  }

  return <Text style={{ whiteSpace: 'pre-wrap' }}>{parts.length > 0 ? parts : content}</Text>;
}
