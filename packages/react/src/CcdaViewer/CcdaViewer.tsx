// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import type { TablerIcon } from '@tabler/icons-react';
import {
  IconAlertTriangle,
  IconAmbulance,
  IconBuildingHospital,
  IconChevronDown,
  IconChevronsUp,
  IconChevronUp,
  IconClipboardText,
  IconEye,
  IconFirstAidKit,
  IconHeart,
  IconHeartbeat,
  IconListDetails,
  IconNurse,
  IconRefresh,
  IconSquarePlus,
  IconStethoscope,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { createElement, useMemo, useState } from 'react';
import { CcdaHeader } from './CcdaHeader';
import { CcdaNarrative } from './CcdaNarrative';
import classes from './CcdaViewer.module.css';
import {
  attr,
  childEl,
  childEls,
  formatCdaCode,
  formatCdaName,
  isSafeHref,
  parseCcda,
  textOf,
} from './CcdaViewer.utils';

export interface CcdaViewerProps {
  /** The C-CDA document as an XML string. */
  readonly xml: string;
}

interface CcdaSectionInfo {
  /** Section LOINC code, so layout preferences carry across documents. */
  readonly key: string;
  readonly title: string;
  readonly element: Element;
}

const HIDDEN_KEY = 'medplum-ccda-viewer-hidden';
const ORDER_KEY = 'medplum-ccda-viewer-order';
const COLLAPSED_KEY = 'medplum-ccda-viewer-collapsed';

/**
 * Displays a C-CDA document: patient and document header, a table of contents, and one card
 * per section. Users can hide, collapse, and reorder sections; those choices are remembered
 * per section code and applied to every C-CDA opened afterwards.
 * @param props - The viewer props.
 * @returns The rendered C-CDA document.
 */
export function CcdaViewer(props: CcdaViewerProps): JSX.Element {
  const parsed = useMemo(() => parseCcda(props.xml), [props.xml]);
  if (parsed.error !== undefined) {
    return (
      <Alert color="red" title="Unable to display C-CDA" icon={<IconAlertTriangle />}>
        {parsed.error}
      </Alert>
    );
  }
  return <CcdaDocument document={parsed.document} />;
}

function CcdaDocument(props: { readonly document: Element }): JSX.Element {
  const { document } = props;
  const sections = useMemo(() => getSections(document), [document]);
  const nonXmlBody = childEl(document, 'component', 'nonXMLBody');

  const [hidden, setHidden] = useLocalStorage<string[]>({
    key: HIDDEN_KEY,
    defaultValue: [],
    getInitialValueInEffect: false,
  });
  const [order, setOrder] = useLocalStorage<string[]>({
    key: ORDER_KEY,
    defaultValue: [],
    getInitialValueInEffect: false,
  });
  const [collapseAll, setCollapseAll] = useLocalStorage<boolean>({
    key: COLLAPSED_KEY,
    defaultValue: false,
    getInitialValueInEffect: false,
  });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [tocOpen, setTocOpen] = useState(false);

  const ordered = useMemo(() => sortSections(sections, order), [sections, order]);
  const keys = ordered.map((s) => s.key);
  const hiddenCount = keys.filter((key) => hidden.includes(key)).length;

  // Keep preferences for sections that are not in this document.
  const saveOrder = (newKeys: string[]): void => setOrder([...newKeys, ...order.filter((k) => !keys.includes(k))]);
  const moveToTop = (key: string): void => saveOrder([key, ...keys.filter((k) => k !== key)]);
  const moveDown = (key: string): void => {
    const i = keys.indexOf(key);
    if (i >= 0 && i < keys.length - 1) {
      saveOrder([...keys.slice(0, i), keys[i + 1], key, ...keys.slice(i + 2)]);
    }
  };
  const toggleHidden = (key: string): void =>
    setHidden(hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]);
  const isCollapsed = (key: string): boolean => collapsed[key] ?? collapseAll;

  return (
    <Stack gap="sm">
      <Title order={3}>
        {textOf(childEl(document, 'title')) || formatCdaCode(childEl(document, 'code')) || 'Clinical Document'}
      </Title>
      <CcdaHeader document={document} />
      {sections.length > 1 && (
        <Group gap="xs">
          <Button
            variant="light"
            size="xs"
            leftSection={<IconListDetails size={16} />}
            onClick={() => setTocOpen((o) => !o)}
          >
            Table of contents
          </Button>
          {hiddenCount > 0 && (
            <Badge color="yellow" variant="light" leftSection={<IconAlertTriangle size={12} />}>
              {hiddenCount} hidden
            </Badge>
          )}
          <Button
            variant="subtle"
            size="xs"
            onClick={() => {
              setCollapseAll(!collapseAll);
              setCollapsed({});
            }}
          >
            {collapseAll ? 'Expand all' : 'Collapse all'}
          </Button>
        </Group>
      )}
      {tocOpen && (
        <Paper withBorder p="sm" aria-label="Table of contents">
          <Stack gap={4}>
            {ordered.map((section) => (
              <Group key={section.key} gap="xs" wrap="nowrap">
                <Checkbox
                  style={{ flex: 1 }}
                  label={sentenceCase(section.title)}
                  checked={!hidden.includes(section.key)}
                  onChange={() => toggleHidden(section.key)}
                />
                <ActionIcon variant="subtle" aria-label="Move to top" onClick={() => moveToTop(section.key)}>
                  <IconChevronsUp size={16} />
                </ActionIcon>
                <ActionIcon variant="subtle" aria-label="Move down" onClick={() => moveDown(section.key)}>
                  <IconChevronDown size={16} />
                </ActionIcon>
              </Group>
            ))}
            <Group gap="xs" mt="xs">
              <Button size="xs" variant="default" leftSection={<IconRefresh size={14} />} onClick={() => setOrder([])}>
                Restore original order
              </Button>
              <Button size="xs" variant="default" leftSection={<IconEye size={14} />} onClick={() => setHidden([])}>
                Show all
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}
      <div className={classes.grid}>
        {ordered
          .filter((section) => !hidden.includes(section.key))
          .map((section) => (
            <CcdaSectionCard
              key={section.key}
              section={section}
              collapsed={isCollapsed(section.key)}
              onToggleCollapsed={() => setCollapsed({ ...collapsed, [section.key]: !isCollapsed(section.key) })}
              onMoveToTop={() => moveToTop(section.key)}
              onMoveDown={() => moveDown(section.key)}
              onHide={() => toggleHidden(section.key)}
            />
          ))}
      </div>
      {nonXmlBody && <NonXmlBody body={nonXmlBody} />}
    </Stack>
  );
}

interface CcdaSectionCardProps {
  readonly section: CcdaSectionInfo;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  readonly onMoveToTop: () => void;
  readonly onMoveDown: () => void;
  readonly onHide: () => void;
}

function CcdaSectionCard(props: CcdaSectionCardProps): JSX.Element {
  const { section, collapsed } = props;
  const title = sentenceCase(section.title);
  return (
    <Paper withBorder p="sm" data-testid="ccda-section">
      <Group justify="space-between" wrap="nowrap" mb={collapsed ? 0 : 'xs'}>
        <Group gap="xs" wrap="nowrap">
          {createElement(sectionIcon(section.title), { size: 20, className: classes.sectionTitle })}
          <Text fw={700} className={classes.sectionTitle}>
            {title}
          </Text>
        </Group>
        <Group gap={2} wrap="nowrap">
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}
            onClick={props.onToggleCollapsed}
          >
            {collapsed ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />}
          </ActionIcon>
          <ActionIcon variant="subtle" color="gray" aria-label={`Move ${title} to top`} onClick={props.onMoveToTop}>
            <IconChevronsUp size={16} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="gray" aria-label={`Move ${title} down`} onClick={props.onMoveDown}>
            <IconChevronDown size={16} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="gray" aria-label={`Hide ${title}`} onClick={props.onHide}>
            <IconX size={16} />
          </ActionIcon>
        </Group>
      </Group>
      {!collapsed && <SectionBody section={section.element} />}
    </Paper>
  );
}

function SectionBody(props: { readonly section: Element }): JSX.Element {
  const { section } = props;
  const text = childEl(section, 'text');
  const authors = childEls(section, 'author').map((author) => {
    const assigned = childEl(author, 'assignedAuthor');
    return (
      formatCdaName(childEl(assigned, 'assignedPerson', 'name')) ||
      textOf(childEl(assigned, 'assignedAuthoringDevice', 'softwareName'))
    );
  });
  return (
    <>
      {authors.some(Boolean) && (
        <Text size="xs" c="dimmed" mb="xs">
          Section author: {authors.filter(Boolean).join(', ')}
        </Text>
      )}
      {text && <CcdaNarrative element={text} />}
      {nestedSections(section).map((nested, i) => (
        <Box key={i} ml="md" mt="xs">
          <Text fw={600} size="sm">
            {textOf(childEl(nested, 'title'))}
          </Text>
          <SectionBody section={nested} />
        </Box>
      ))}
    </>
  );
}

function NonXmlBody(props: { readonly body: Element }): JSX.Element {
  const text = childEl(props.body, 'text');
  const mediaType = attr(text, 'mediaType');
  const reference = attr(childEl(text, 'reference'), 'value');
  if (isSafeHref(reference)) {
    return (
      <Anchor href={reference} target="_blank" rel="noopener noreferrer">
        Open attached document
      </Anchor>
    );
  }
  if (mediaType?.startsWith('text/') && attr(text, 'representation') !== 'B64') {
    return <pre>{text?.textContent}</pre>;
  }
  return (
    <Text c="dimmed">This document has a non-XML body ({mediaType ?? 'unknown type'}) that cannot be displayed.</Text>
  );
}

function nestedSections(section: Element): Element[] {
  return childEls(section, 'component').flatMap((component) => childEls(component, 'section'));
}

function getSections(document: Element): CcdaSectionInfo[] {
  const body = childEl(document, 'component', 'structuredBody');
  const seen = new Set<string>();
  return nestedSections(body ?? document).map((element, i) => {
    const code = childEl(element, 'code');
    let key = attr(code, 'code') ?? `section-${i}`;
    if (seen.has(key)) {
      key = `${key}-${i}`;
    }
    seen.add(key);
    const title = textOf(childEl(element, 'title')) || formatCdaCode(code) || 'Untitled section';
    return { key, title, element };
  });
}

function sortSections(sections: CcdaSectionInfo[], order: string[]): CcdaSectionInfo[] {
  const rank = (section: CcdaSectionInfo, docIndex: number): number => {
    const i = order.indexOf(section.key);
    return i >= 0 ? i : order.length + docIndex;
  };
  return sections
    .map((section, docIndex) => ({ section, rank: rank(section, docIndex) }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ section }) => section);
}

function sentenceCase(title: string): string {
  const lower = title.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

const FALLBACK_ICONS: TablerIcon[] = [
  IconAmbulance,
  IconHeartbeat,
  IconStethoscope,
  IconSquarePlus,
  IconBuildingHospital,
  IconNurse,
  IconHeart,
  IconFirstAidKit,
  IconHeartbeat,
  IconSquarePlus,
];

function sectionIcon(title: string): TablerIcon {
  const lower = title.toLowerCase();
  if (lower.includes('family')) {
    return IconUsers;
  }
  if (lower.includes('medication')) {
    return IconFirstAidKit;
  }
  if (lower.includes('referral')) {
    return IconAmbulance;
  }
  if (lower.includes('result')) {
    return IconClipboardText;
  }
  return FALLBACK_ICONS[title.length % FALLBACK_ICONS.length];
}
