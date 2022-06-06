import { Resource } from '@medplum/fhirtypes';
import { PropertyType } from '../types';
import {
  booleanToTypedValue,
  fhirPathEquals,
  fhirPathEquivalent,
  fhirPathIs,
  isQuantity,
  removeDuplicates,
  toJsBoolean,
} from './utils';

export interface TypedValue {
  readonly type: PropertyType;
  readonly value: any;
}

export interface Atom {
  eval(context: TypedValue[]): TypedValue[];
}

export class FhirPathAtom implements Atom {
  constructor(public readonly original: string, public readonly child: Atom) {}

  eval(context: TypedValue[]): TypedValue[] {
    try {
      if (context.length > 0) {
        return context.map((e) => this.child.eval([e])).flat();
      } else {
        return this.child.eval(context);
      }
    } catch (error) {
      throw new Error(`FhirPathError on "${this.original}": ${error}`);
    }
  }
}

export class LiteralAtom implements Atom {
  constructor(public readonly value: TypedValue) {}
  eval(): TypedValue[] {
    return [this.value];
  }
}

export class SymbolAtom implements Atom {
  constructor(public readonly name: string) {}
  eval(context: TypedValue[]): TypedValue[] {
    if (this.name === '$this') {
      return context;
    }
    return context
      .map((e: TypedValue) => {
        const input = e.value;
        let result: any = undefined;
        if (input && typeof input === 'object') {
          if ('resourceType' in input && (input as Resource).resourceType === this.name) {
            return e;
          }
          if (this.name in input) {
            // TODO: Get PropertyType from the schema
            result = (input as { [key: string]: unknown })[this.name];
          }
          const propertyName = Object.keys(input).find((k) => k.startsWith(this.name));
          if (propertyName) {
            // TODO: Get the PropertyType from the choice of type
            result = (input as { [key: string]: unknown })[propertyName];
          }
        }
        // TODO: Get the PropertyType from the choice of type
        if (result === undefined) {
          return { type: PropertyType.string, value: undefined };
        } else if (Array.isArray(result)) {
          return result.map((e) => ({ type: PropertyType.string, value: e }));
        } else {
          return [{ type: PropertyType.string, value: result }];
        }
      })
      .flat()
      .filter((e) => e.value !== undefined);
  }
}

export class EmptySetAtom implements Atom {
  eval(): [] {
    return [];
  }
}

export class UnaryOperatorAtom implements Atom {
  constructor(public readonly child: Atom, public readonly impl: (x: TypedValue[]) => TypedValue[]) {}

  eval(context: TypedValue[]): TypedValue[] {
    return this.impl(this.child.eval(context));
  }
}

export class AsAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: TypedValue[]): TypedValue[] {
    return this.left.eval(context);
  }
}

export class ArithemticOperatorAtom implements Atom {
  constructor(
    public readonly left: Atom,
    public readonly right: Atom,
    public readonly impl: (x: number, y: number) => number
  ) {}

  eval(context: TypedValue[]): TypedValue[] {
    const leftEvalResult = this.left.eval(context);
    if (leftEvalResult.length !== 1) {
      return [];
    }
    const rightEvalResult = this.right.eval(context);
    if (rightEvalResult.length !== 1) {
      return [];
    }
    const leftValue = leftEvalResult[0].value;
    const rightValue = rightEvalResult[0].value;
    if (isQuantity(leftValue) && isQuantity(rightValue)) {
      return [
        {
          type: PropertyType.Quantity,
          value: {
            ...leftValue,
            value: this.impl(leftValue.value as number, rightValue.value as number),
          },
        },
      ];
    } else {
      return [{ type: leftEvalResult[0].type, value: this.impl(leftValue as number, rightValue as number) }];
    }
  }
}

export class ComparisonOperatorAtom implements Atom {
  constructor(
    public readonly left: Atom,
    public readonly right: Atom,
    public readonly impl: (x: number, y: number) => boolean
  ) {}

  eval(context: TypedValue[]): TypedValue[] {
    const leftEvalResult = this.left.eval(context);
    if (leftEvalResult.length !== 1) {
      return [];
    }
    const rightEvalResult = this.right.eval(context);
    if (rightEvalResult.length !== 1) {
      return [];
    }
    const leftValue = leftEvalResult[0].value;
    const rightValue = rightEvalResult[0].value;
    if (isQuantity(leftValue) && isQuantity(rightValue)) {
      return booleanToTypedValue(this.impl(leftValue.value as number, rightValue.value as number));
    } else {
      return booleanToTypedValue(this.impl(leftValue as number, rightValue as number));
    }
  }
}

export class ConcatAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    const result = [...leftValue, ...rightValue];
    if (result.length > 0 && result.every((e) => typeof e.value === 'string')) {
      return [{ type: PropertyType.string, value: result.map((e) => e.value as string).join('') }];
    }
    return result;
  }
}

export class ContainsAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    return booleanToTypedValue(leftValue.some((e) => e.value === rightValue[0].value));
  }
}

export class InAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    return booleanToTypedValue(rightValue.some((e) => e.value === leftValue[0].value));
  }
}

export class DotAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}
  eval(context: TypedValue[]): TypedValue[] {
    return this.right.eval(this.left.eval(context));
  }
}

export class UnionAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}
  eval(context: TypedValue[]): TypedValue[] {
    const leftResult = this.left.eval(context);
    const rightResult = this.right.eval(context);
    return removeDuplicates([...leftResult, ...rightResult]);
  }
}

export class EqualsAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    return fhirPathEquals(leftValue, rightValue);
  }
}

export class NotEqualsAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    return booleanToTypedValue(!toJsBoolean(fhirPathEquals(leftValue, rightValue)));
  }
}

export class EquivalentAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    return fhirPathEquivalent(leftValue, rightValue);
  }
}

export class NotEquivalentAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    return booleanToTypedValue(!toJsBoolean(fhirPathEquivalent(leftValue, rightValue)));
  }
}

export class IsAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context);
    if (leftValue.length !== 1) {
      return [];
    }
    const typeName = (this.right as SymbolAtom).name;
    return booleanToTypedValue(fhirPathIs(leftValue[0], typeName));
  }
}

/**
 * 6.5.1. and
 * Returns true if both operands evaluate to true, false if either operand evaluates to false, and the empty collection ({ }) otherwise.
 */
export class AndAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    if (leftValue[0]?.value === true && rightValue[0]?.value === true) {
      return booleanToTypedValue(true);
    }
    if (leftValue[0]?.value === false || rightValue[0]?.value === false) {
      return booleanToTypedValue(false);
    }
    return [];
  }
}

export class OrAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: TypedValue[]): TypedValue[] {
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

  eval(context: TypedValue[]): TypedValue[] {
    const leftResult = this.left.eval(context);
    const rightResult = this.right.eval(context);
    if (leftResult.length === 0 && rightResult.length === 0) {
      return [];
    }
    const leftValue = leftResult.length === 0 ? null : leftResult[0].value;
    const rightValue = rightResult.length === 0 ? null : rightResult[0].value;
    if ((leftValue === true && rightValue !== true) || (leftValue !== true && rightValue === true)) {
      return booleanToTypedValue(true);
    }
    if ((leftValue === true && rightValue === true) || (leftValue === false && rightValue === false)) {
      return booleanToTypedValue(false);
    }
    return [];
  }
}

export class FunctionAtom implements Atom {
  constructor(
    public readonly name: string,
    public readonly args: Atom[],
    public readonly impl: (context: TypedValue[], ...a: Atom[]) => TypedValue[]
  ) {}
  eval(context: TypedValue[]): TypedValue[] {
    return this.impl(context, ...this.args);
  }
}

export class IndexerAtom implements Atom {
  constructor(public readonly left: Atom, public readonly expr: Atom) {}
  eval(context: TypedValue[]): TypedValue[] {
    const evalResult = this.expr.eval(context);
    if (evalResult.length !== 1) {
      return [];
    }
    const index = evalResult[0].value;
    if (typeof index !== 'number') {
      throw new Error(`Invalid indexer expression: should return integer}`);
    }
    const leftResult = this.left.eval(context);
    if (!(index in leftResult)) {
      return [];
    }
    return [leftResult[index]];
  }
}
