// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AnchorProps } from '@mantine/core';
import { Anchor } from '@mantine/core';
import type { JSX } from 'react';

interface DocsLinkProps extends Omit<AnchorProps, 'href'> {
  path: string;
  children: React.ReactNode;
}

// A Hyperlink to the Medplum docs
//
// TODO: Consider if we can generate a list of paths of pages under /docs at
// build time, so that a link to a nonexistent page could emit a type error.
export function DocsLink(props: DocsLinkProps): JSX.Element {
  return (
    <Anchor href={`https://www.medplum.com/docs/${props.path}`} target="_blank">
      {props.children}
    </Anchor>
  );
}
