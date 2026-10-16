// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react';

export interface EditableRow<T> {
  /** Stable React key, so removing a row never re-keys the rows after it. */
  readonly id: number;
  readonly value: T;
}

let nextRowId = 0;

function toRows<T>(values: T[]): EditableRow<T>[] {
  return values.map((value) => ({ id: nextRowId++, value }));
}

/**
 * Row state for the list editors (sort rules, filter conditions): values with stable keys plus
 * reset/update/remove/add. `update` and `remove` return the next rows so the caller can emit them.
 * @param initial - Produces the initial row values.
 * @returns The rows and their mutators.
 */
export function useEditableRows<T>(initial: () => T[]): {
  readonly rows: EditableRow<T>[];
  readonly reset: (values: T[]) => void;
  readonly update: (index: number, value: T) => EditableRow<T>[];
  readonly remove: (index: number) => EditableRow<T>[];
  readonly add: (value: T) => void;
} {
  const [rows, setRows] = useState(() => toRows(initial()));

  function update(index: number, value: T): EditableRow<T>[] {
    const next = rows.map((row, i) => (i === index ? { ...row, value } : row));
    setRows(next);
    return next;
  }

  function remove(index: number): EditableRow<T>[] {
    const next = rows.filter((_, i) => i !== index);
    setRows(next);
    return next;
  }

  return {
    rows,
    reset: (values) => setRows(toRows(values)),
    update,
    remove,
    add: (value) => setRows([...rows, ...toRows([value])]),
  };
}
