// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Atom, AtomContext } from '../fhirlexer/parse';
import type { TypedValue } from '../types';

export class IfAtom implements Atom {
  readonly condition: Atom;
  readonly thenExpr: Atom;
  readonly elseExpr: Atom | undefined;

  constructor(condition: Atom, thenExpr: Atom, elseExpr: Atom | undefined) {
    this.condition = condition;
    this.thenExpr = thenExpr;
    this.elseExpr = elseExpr;
  }

  eval(_context: AtomContext, _input: TypedValue[]): TypedValue[] {
    throw new Error('Method not implemented.');
  }

  toString(): string {
    throw new Error('Method not implemented.');
  }
}

export class IntervalAtom implements Atom {
  readonly start: Atom;
  readonly end: Atom;

  constructor(start: Atom, end: Atom) {
    this.start = start;
    this.end = end;
  }

  eval(_context: AtomContext, _input: TypedValue[]): TypedValue[] {
    throw new Error('Method not implemented.');
  }

  toString(): string {
    throw new Error('Method not implemented.');
  }
}
