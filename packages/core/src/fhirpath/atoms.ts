import { Quantity, Resource } from '@medplum/fhirtypes';
import {
  applyMaybeArray,
  ensureArray,
  fhirPathEquals,
  fhirPathEquivalent,
  fhirPathIs,
  isQuantity,
  removeDuplicates,
  toJsBoolean,
} from './utils';

export interface Atom {
  eval(context: unknown): unknown;
}

export class FhirPathAtom implements Atom {
  constructor(public readonly original: string, public readonly child: Atom) {}

  eval(context: unknown): unknown[] {
    try {
      const result = applyMaybeArray(context, (e) => this.child.eval(e));
      if (Array.isArray(result)) {
        return result.flat();
      } else if (result === undefined || result === null) {
        return [];
      } else {
        return [result];
      }
    } catch (error) {
      throw new Error(`FhirPathError on "${this.original}": ${error}`);
    }
  }
}

export class LiteralAtom implements Atom {
  constructor(public readonly value: Quantity | boolean | number | string) {}
  eval(): unknown {
    return this.value;
  }
}

export class SymbolAtom implements Atom {
  constructor(public readonly name: string) {}
  eval(context: unknown): unknown {
    if (this.name === '$this') {
      return context;
    }
    return applyMaybeArray(context, (e) => {
      if (e && typeof e === 'object') {
        if ('resourceType' in e && (e as Resource).resourceType === this.name) {
          return e;
        }
        if (this.name in e) {
          return (e as { [key: string]: unknown })[this.name];
        }
        const propertyName = Object.keys(e).find((k) => k.startsWith(this.name));
        if (propertyName) {
          return (e as { [key: string]: unknown })[propertyName];
        }
      }
      return undefined;
    });
  }
}

export class EmptySetAtom implements Atom {
  eval(): [] {
    return [];
  }
}

export class UnaryOperatorAtom implements Atom {
  constructor(public readonly child: Atom, public readonly impl: (x: unknown) => unknown) {}

  eval(context: unknown): unknown {
    return this.impl(this.child.eval(context));
  }
}

export class AsAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: unknown): unknown {
    return this.left.eval(context);
  }
}

export class ArithemticOperatorAtom implements Atom {
  constructor(
    public readonly left: Atom,
    public readonly right: Atom,
    public readonly impl: (x: number, y: number) => number
  ) {}

  eval(context: unknown): unknown {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    if (isQuantity(leftValue) && isQuantity(rightValue)) {
      return {
        ...leftValue,
        value: this.impl(leftValue.value as number, rightValue.value as number),
      };
    } else {
      return this.impl(leftValue as number, rightValue as number);
    }
  }
}

export class ComparisonOperatorAtom implements Atom {
  constructor(
    public readonly left: Atom,
    public readonly right: Atom,
    public readonly impl: (x: number, y: number) => boolean
  ) {}

  eval(context: unknown): unknown {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    if (isQuantity(leftValue) && isQuantity(rightValue)) {
      return this.impl(leftValue.value as number, rightValue.value as number);
    } else {
      return this.impl(leftValue as number, rightValue as number);
    }
  }
}

export class ConcatAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: unknown): unknown {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    const result: unknown[] = [];
    function add(value: unknown): void {
      if (value) {
        if (Array.isArray(value)) {
          result.push(...value);
        } else {
          result.push(value);
        }
      }
    }
    add(leftValue);
    add(rightValue);
    if (result.length > 0 && result.every((e) => typeof e === 'string')) {
      return result.join('');
    }
    return result;
  }
}

export class ContainsAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: unknown): unknown {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    return ensureArray(leftValue).includes(rightValue);
  }
}

export class InAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: unknown): unknown {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    return ensureArray(rightValue).includes(leftValue);
  }
}

export class DotAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}
  eval(context: unknown): unknown {
    return this.right.eval(this.left.eval(context));
  }
}

export class UnionAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}
  eval(context: unknown): unknown {
    const leftResult = this.left.eval(context);
    const rightResult = this.right.eval(context);
    let resultArray: unknown[];
    if (leftResult !== undefined && rightResult !== undefined) {
      resultArray = [leftResult, rightResult].flat();
    } else if (leftResult !== undefined) {
      resultArray = ensureArray(leftResult);
    } else if (rightResult !== undefined) {
      resultArray = ensureArray(rightResult);
    } else {
      resultArray = [];
    }
    return removeDuplicates(resultArray);
  }
}

export class EqualsAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: unknown): unknown {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
      return fhirPathEquals(leftValue.flat(), rightValue);
    }
    return applyMaybeArray(leftValue, (e) => fhirPathEquals(e, rightValue));
  }
}

export class NotEqualsAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: unknown): unknown {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    let result;
    if (Array.isArray(rightValue)) {
      result = fhirPathEquals(leftValue, rightValue);
    } else {
      result = applyMaybeArray(leftValue, (e) => fhirPathEquals(e, rightValue));
    }
    return !toJsBoolean(result);
  }
}

export class EquivalentAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: unknown): unknown {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    if (Array.isArray(rightValue)) {
      return fhirPathEquivalent(leftValue, rightValue);
    }
    return applyMaybeArray(leftValue, (e) => fhirPathEquivalent(e, rightValue));
  }
}

export class NotEquivalentAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: unknown): unknown {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    let result;
    if (Array.isArray(rightValue)) {
      result = fhirPathEquivalent(leftValue, rightValue);
    } else {
      result = applyMaybeArray(leftValue, (e) => fhirPathEquivalent(e, rightValue));
    }
    return !toJsBoolean(result);
  }
}

export class IsAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: unknown): unknown {
    const typeName = (this.right as SymbolAtom).name;
    return applyMaybeArray(this.left.eval(context), (e) => fhirPathIs(e, typeName));
  }
}

/**
 * 6.5.1. and
 * Returns true if both operands evaluate to true, false if either operand evaluates to false, and the empty collection ({ }) otherwise.
 */
export class AndAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: unknown): unknown {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    if (leftValue === true && rightValue === true) {
      return true;
    }
    if (leftValue === false || rightValue === false) {
      return false;
    }
    return [];
  }
}

export class OrAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: unknown): unknown {
    const leftValue = this.left.eval(context);
    if (toJsBoolean(leftValue)) {
      return leftValue;
    }

    const rightValue = this.right.eval(context);
    if (toJsBoolean(rightValue)) {
      return rightValue;
    }

    return [];
  }
}

/**
 * 6.5.4. xor
 * Returns true if exactly one of the operands evaluates to true,
 * false if either both operands evaluate to true or both operands evaluate to false,
 * and the empty collection ({ }) otherwise:
 */
export class XorAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: unknown): unknown {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    if ((leftValue === true && rightValue !== true) || (leftValue !== true && rightValue === true)) {
      return true;
    }
    if ((leftValue === true && rightValue === true) || (leftValue === false && rightValue === false)) {
      return false;
    }
    return [];
  }
}

export class FunctionAtom implements Atom {
  constructor(
    public readonly name: string,
    public readonly args: Atom[],
    public readonly impl: (context: unknown[], ...a: Atom[]) => unknown[]
  ) {}
  eval(context: unknown): unknown {
    return this.impl(ensureArray(context), ...this.args);
  }
}

export class IndexerAtom implements Atom {
  constructor(public readonly left: Atom, public readonly expr: Atom) {}
  eval(context: unknown): unknown {
    const index = this.expr.eval(context);
    if (typeof index !== 'number') {
      throw new Error(`Invalid indexer expression: should return integer}`);
    }
    const leftResult: unknown[] = this.left.eval(context) as unknown[];
    if (!(index in leftResult)) {
      return [];
    }
    return leftResult[index];
  }
}
