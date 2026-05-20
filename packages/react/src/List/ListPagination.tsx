// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Pagination } from '@mantine/core';
import type { JSX } from 'react';
import classes from './List.module.css';

export interface ListPaginationProps {
  /** Total number of items across all pages. */
  readonly total: number | undefined;
  /** Current zero-based offset into the result set. */
  readonly offset: number;
  /** Number of items per page. */
  readonly pageSize: number;
  /** Called with the new zero-based offset when the user changes pages. */
  readonly onOffsetChange: (offset: number) => void;
  readonly size?: string | number;
  readonly siblings?: number;
  readonly boundaries?: number;
}

/**
 * Pagination footer for `ListShell`. Renders a top divider, centered Mantine
 * `Pagination`, and consistent vertical padding. Returns `null` when there's
 * nothing to paginate (no total, or fewer items than `pageSize`), so it can be
 * dropped directly into a `footer` slot without conditional rendering at the
 * call site and without leaving an empty divider behind.
 * @param props - The pagination props (total, offset, pageSize, onOffsetChange, etc.).
 * @returns The wrapped `Pagination` element, or `null` when pagination is unnecessary.
 */
export function ListPagination(props: ListPaginationProps): JSX.Element | null {
  const { total, offset, pageSize, onOffsetChange, size = 'sm', siblings = 1, boundaries = 1 } = props;

  if (total === undefined || pageSize <= 0 || total <= pageSize) {
    return null;
  }

  const currentPage = Math.floor(offset / pageSize) + 1;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <>
      <Divider mx="xs" color="gray.2" />
      <div className={classes.footer}>
        <Pagination
          value={currentPage}
          total={totalPages}
          onChange={(page) => onOffsetChange((page - 1) * pageSize)}
          size={size}
          siblings={siblings}
          boundaries={boundaries}
        />
      </div>
    </>
  );
}
