// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text, Tooltip } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { formatDate } from '@medplum/core';
import type { DocumentReference } from '@medplum/fhirtypes';
import { MedplumLink } from '@medplum/react';
import cx from 'clsx';
import type { AnchorHTMLAttributes, JSX, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import classes from './DocumentListItem.module.css';
import { getDocumentName, getDocumentSource, getDocumentTypeDisplay } from './documentDisplay';

interface DocumentListItemProps {
  item: WithId<DocumentReference>;
  selectedDocumentId?: string;
  getItemUri: (item: WithId<DocumentReference>) => string;
  id?: string;
}

/**
 * Tracks whether a single-line, truncated element is currently overflowing its container.
 * @param content - The text rendered in the element; overflow is re-checked when it changes.
 * @returns A tuple of the ref to attach to the element and whether it is currently truncated.
 */
function useIsTruncated(content: string): [RefObject<HTMLParagraphElement | null>, boolean] {
  const ref = useRef<HTMLParagraphElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return undefined;
    }
    const check = (): void => setIsTruncated(el.scrollWidth > el.clientWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [content]);

  return [ref, isTruncated];
}

export function DocumentListItem({ item, selectedDocumentId, getItemUri, id }: DocumentListItemProps): JSX.Element {
  const isSelected = selectedDocumentId === item.id;

  const name = getDocumentName(item);
  const date = item.date || item.meta?.lastUpdated;
  const source = getDocumentSource(item);
  const documentType = getDocumentTypeDisplay(item);

  const metaPrefix = [date ? formatDate(date) : undefined, source].filter(Boolean).join(' · ');
  const metaLine = documentType ? `${metaPrefix}: ${documentType}` : metaPrefix;

  const [nameRef, isNameTruncated] = useIsTruncated(name);
  const [metaRef, isMetaTruncated] = useIsTruncated(metaLine);

  // MedplumLinkProps only types Mantine's style props, so the listbox-option DOM
  // attributes are passed via a spread (they reach the underlying <a> through ...rest).
  const optionProps: AnchorHTMLAttributes<HTMLAnchorElement> = {
    id,
    role: 'option',
    tabIndex: isSelected ? 0 : -1,
    'aria-selected': isSelected,
  };

  return (
    <MedplumLink
      {...optionProps}
      to={getItemUri(item)}
      underline="never"
      className={cx(classes.item, isSelected && classes.selected)}
    >
      <Stack gap={0} miw={0}>
        <Tooltip label={name} disabled={!isNameTruncated} multiline maw={320} withinPortal openDelay={300}>
          <Text ref={nameRef} fw={700} truncate="end" miw={0}>
            {name}
          </Text>
        </Tooltip>
        <Tooltip
          label={documentType}
          disabled={!isMetaTruncated || !documentType}
          multiline
          maw={320}
          withinPortal
          openDelay={300}
        >
          <Text ref={metaRef} size="sm" c="dimmed" truncate="end">
            {metaLine}
          </Text>
        </Tooltip>
      </Stack>
    </MedplumLink>
  );
}
