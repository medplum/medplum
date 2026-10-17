// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Text } from '@mantine/core';
import type { JSX, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import classes from './CcdaViewer.module.css';
import { attr, childEl, childEls, isSafeHref, isSafeImageSrc, textOf } from './CcdaViewer.utils';

export interface CcdaNarrativeProps {
  /** The section `text` element. */
  readonly element: Element;
}

/**
 * Renders a CDA narrative block. Only known narrative elements are emitted, so document
 * content never reaches the page as raw HTML.
 * @param props - The narrative props.
 * @returns The rendered narrative.
 */
export function CcdaNarrative(props: CcdaNarrativeProps): JSX.Element {
  return <div className={classes.narrative}>{renderChildren(props.element)}</div>;
}

function renderChildren(el: Element): ReactNode[] {
  return Array.from(el.childNodes).map(renderNode);
}

function renderNode(node: ChildNode, key: number): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }
  const el = node as Element;
  const children = renderChildren(el);
  const className = styleCodeClass(el);
  switch (el.localName) {
    case 'paragraph':
      return (
        <p key={key} className={className}>
          {children}
        </p>
      );
    case 'pre':
      return <pre key={key}>{el.textContent}</pre>;
    case 'content':
      if (attr(el, 'revised') === 'delete') {
        return null;
      }
      return (
        <span key={key} className={className}>
          {children}
        </span>
      );
    case 'br':
      return <br key={key} />;
    case 'list':
      return <CcdaList key={key} list={el} />;
    case 'table':
      return <CcdaTable key={key} table={el} />;
    case 'caption':
      return <b key={key}>{children}</b>;
    case 'sub':
      return <sub key={key}>{children}</sub>;
    case 'sup':
    case 'footnote':
    case 'footnoteRef':
      return <sup key={key}>{children}</sup>;
    case 'linkHtml': {
      const href = attr(el, 'href');
      return isSafeHref(href) ? (
        <Anchor key={key} href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </Anchor>
      ) : (
        <span key={key}>{children}</span>
      );
    }
    case 'renderMultiMedia': {
      const src = findMultiMediaSrc(el);
      return isSafeImageSrc(src) ? <img key={key} src={src} alt="" className={classes.image} /> : null;
    }
    default:
      return (
        <span key={key} className={className}>
          {children}
        </span>
      );
  }
}

const STYLE_CODE_CLASSES: Record<string, string | undefined> = {
  Bold: classes.bold,
  Italics: classes.italics,
  Underline: classes.underline,
  Emphasis: classes.emphasis,
};

function styleCodeClass(el: Element): string | undefined {
  const styleCode = attr(el, 'styleCode');
  if (!styleCode) {
    return undefined;
  }
  const names = styleCode
    .split(/\s+/)
    .map((code) => STYLE_CODE_CLASSES[code])
    .filter(Boolean);
  return names.length ? names.join(' ') : undefined;
}

function findMultiMediaSrc(el: Element): string | undefined {
  const ref = attr(el, 'referencedObject');
  if (!ref || !el.ownerDocument) {
    return undefined;
  }
  const target = Array.from(el.ownerDocument.getElementsByTagNameNS('*', '*')).find((e) => attr(e, 'ID') === ref);
  const media = target?.localName === 'observationMedia' ? target : findDescendant(target, 'observationMedia');
  const value = childEl(media, 'value');
  if (!attr(value, 'mediaType')?.startsWith('image/')) {
    return undefined;
  }
  return attr(childEl(value, 'reference'), 'value');
}

function findDescendant(el: Element | undefined, localName: string): Element | undefined {
  return el ? Array.from(el.getElementsByTagNameNS('*', localName))[0] : undefined;
}

function CcdaList(props: { readonly list: Element }): JSX.Element {
  const { list } = props;
  const caption = childEl(list, 'caption');
  const items = childEls(list, 'item').map((item, i) => <li key={i}>{renderChildren(item)}</li>);
  return (
    <>
      {caption && <b>{renderChildren(caption)}</b>}
      {attr(list, 'listType') === 'ordered' ? <ol>{items}</ol> : <ul>{items}</ul>}
    </>
  );
}

type RowKind = 'duplicate' | 'potential';

/**
 * Classifies table body rows: an exact repeat of an earlier row is a duplicate, and a row
 * whose first cell repeats an earlier row's first cell is a potential duplicate.
 * @param rows - The body rows, in document order.
 * @returns The kind of each flagged row.
 */
function classifyRows(rows: Element[]): Map<Element, RowKind> {
  const result = new Map<Element, RowKind>();
  const seenRows = new Set<string>();
  const seenFirstCells = new Set<string>();
  for (const row of rows) {
    const cells = Array.from(row.children).map(textOf);
    const rowText = cells.join('\u0000');
    const firstCell = cells[0] ?? '';
    if (seenRows.has(rowText)) {
      result.set(row, 'duplicate');
    } else if (firstCell && seenFirstCells.has(firstCell)) {
      result.set(row, 'potential');
    }
    seenRows.add(rowText);
    seenFirstCells.add(firstCell);
  }
  return result;
}

function CcdaTable(props: { readonly table: Element }): JSX.Element {
  const { table } = props;
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [hidePotential, setHidePotential] = useState(false);

  const bodies = useMemo(() => {
    const explicit = childEls(table, 'tbody');
    return explicit.length ? explicit : [table];
  }, [table]);
  const rowKinds = useMemo(() => {
    const kinds = new Map<Element, RowKind>();
    for (const body of bodies) {
      classifyRows(childEls(body, 'tr')).forEach((kind, row) => kinds.set(row, kind));
    }
    return kinds;
  }, [bodies]);

  const duplicateCount = Array.from(rowKinds.values()).filter((kind) => kind === 'duplicate').length;
  const potentialCount = rowKinds.size - duplicateCount;

  const renderRow = (row: Element, key: number): ReactNode => {
    const kind = rowKinds.get(row);
    if ((kind === 'duplicate' && !showDuplicates) || (kind === 'potential' && hidePotential)) {
      return null;
    }
    return (
      <tr key={key} className={kind && classes[kind]}>
        {Array.from(row.children).map((cell, i) => {
          const Cell = cell.localName === 'th' ? 'th' : 'td';
          return (
            <Cell key={i} colSpan={numberAttr(cell, 'colspan')} rowSpan={numberAttr(cell, 'rowspan')}>
              {renderChildren(cell)}
            </Cell>
          );
        })}
      </tr>
    );
  };

  const caption = childEl(table, 'caption');
  const thead = childEl(table, 'thead');
  const tfoot = childEl(table, 'tfoot');

  return (
    <div className={classes.tableWrapper}>
      {duplicateCount > 0 && (
        <Text size="xs" c="dimmed">
          {duplicateCount} duplicate {duplicateCount === 1 ? 'row' : 'rows'} {showDuplicates ? 'shown' : 'hidden'}.{' '}
          <Anchor component="button" size="xs" onClick={() => setShowDuplicates((s) => !s)}>
            {showDuplicates ? 'Hide duplicates' : 'Show duplicates'}
          </Anchor>
        </Text>
      )}
      {potentialCount > 0 && (
        <Text size="xs" c="dimmed">
          {potentialCount} potential duplicate {potentialCount === 1 ? 'row' : 'rows'}.{' '}
          <Anchor component="button" size="xs" onClick={() => setHidePotential((h) => !h)}>
            {hidePotential ? 'Show potential duplicates' : 'Hide potential duplicates'}
          </Anchor>
        </Text>
      )}
      <table className={classes.table}>
        {caption && <caption>{renderChildren(caption)}</caption>}
        {thead && <thead>{childEls(thead, 'tr').map(renderRow)}</thead>}
        {bodies.map((body, i) => (
          <tbody key={i}>{childEls(body, 'tr').map(renderRow)}</tbody>
        ))}
        {tfoot && <tfoot>{childEls(tfoot, 'tr').map(renderRow)}</tfoot>}
      </table>
    </div>
  );
}

function numberAttr(el: Element, name: string): number | undefined {
  const value = Number.parseInt(attr(el, name) ?? '', 10);
  return Number.isNaN(value) ? undefined : value;
}
