// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text, Tooltip } from '@mantine/core';
import { formatDate } from '@medplum/core';
import { MedplumLink } from '@medplum/react';
import cx from 'clsx';
import type { AnchorHTMLAttributes, JSX, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import classes from './DocumentListItem.module.css';
import type { PatientDocument } from './DocumentListItem.utils';

interface DocumentListItemProps {
  item: PatientDocument;
  selectedDocumentId?: string;
  getItemUri: (item: PatientDocument) => string;
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

  const metaPrefix = [item.date ? formatDate(item.date) : undefined, item.source].filter(Boolean).join(' · ');
  const metaLine = item.documentType ? `${metaPrefix}: ${item.documentType}` : metaPrefix;

  const [nameRef, isNameTruncated] = useIsTruncated(item.name);
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
        <Tooltip label={item.name} disabled={!isNameTruncated} multiline maw={320} withinPortal openDelay={300}>
          <Text ref={nameRef} fw={700} truncate="end" miw={0}>
            {item.name}
          </Text>
        </Tooltip>
        <Tooltip
          label={item.documentType}
          disabled={!isMetaTruncated || !item.documentType}
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
