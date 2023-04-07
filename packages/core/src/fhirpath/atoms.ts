import { Atom, InfixOperatorAtom, PrefixOperatorAtom } from '../fhirlexer';
import { isResource, PropertyType, TypedValue } from '../types';
import { functions } from './functions';
import {
  booleanToTypedValue,
  fhirPathArrayEquals,
  fhirPathArrayEquivalent,
  fhirPathIs,
  fhirPathNot,
  getTypedPropertyValue,
  isQuantity,
  removeDuplicates,
  toJsBoolean,
  toTypedValue,
} from './utils';

export class FhirPathAtom implements Atom {
  constructor(public readonly original: string, public readonly child: Atom) {}

  eval(context: TypedValue[]): TypedValue[] {
    try {
      if (context.length > 0) {
        return context.map((e) => this.child.eval([e])).flat();
      } else {
        return this.child.eval([]);
      }
    } catch (error) {
      throw new Error(`FhirPathError on "${this.original}": ${error}`);
    }
  }

  toString(): string {
    return this.child.toString();
  }
}

export class LiteralAtom implements Atom {
  constructor(public readonly value: TypedValue) {}
  eval(): TypedValue[] {
    return [this.value];
  }

  toString(): string {
    const value = this.value.value;
    if (typeof value === 'string') {
      return `'${value}'`;
    }
    return value.toString();
  }
}

export class SymbolAtom implements Atom {
  constructor(public readonly name: string) {}
  eval(context: TypedValue[]): TypedValue[] {
    if (this.name === '$this') {
      return context;
    }
    return context
      .map((e) => this.#evalValue(e))
      .flat()
      .filter((e) => e?.value !== undefined) as TypedValue[];
  }

  #evalValue(typedValue: TypedValue): TypedValue[] | TypedValue | undefined {
    const input = typedValue.value;
    if (!input || typeof input !== 'object') {
      return undefined;
    }

    if (isResource(input) && input.resourceType === this.name) {
      return typedValue;
    }

    return getTypedPropertyValue(typedValue, this.name);
  }

  toString(): string {
    return this.name;
  }
}

export class EmptySetAtom implements Atom {
  eval(): [] {
    return [];
  }

  toString(): string {
    return '{}';
  }
}

export class UnaryOperatorAtom extends PrefixOperatorAtom {
  constructor(operator: string, child: Atom, public readonly impl: (x: TypedValue[]) => TypedValue[]) {
    super(operator, child);
  }

  eval(context: TypedValue[]): TypedValue[] {
    return this.impl(this.child.eval(context));
  }

  toString(): string {
    return this.child.toString();
  }
}

export class AsAtom extends InfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('as', left, right);
  }

  eval(context: TypedValue[]): TypedValue[] {
    return functions.ofType(this.left.eval(context), this.right);
  }
}

export class ArithemticOperatorAtom extends InfixOperatorAtom {
  constructor(
    operator: string,
    left: Atom,
    right: Atom,
    public readonly impl: (x: number, y: number) => number | boolean
  ) {
    super(operator, left, right);
  }

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
    const leftNumber = isQuantity(leftValue) ? leftValue.value : leftValue;
    const rightNumber = isQuantity(rightValue) ? rightValue.value : rightValue;
    const result = this.impl(leftNumber, rightNumber);
    if (typeof result === 'boolean') {
      return booleanToTypedValue(result);
    } else if (isQuantity(leftValue)) {
      return [{ type: PropertyType.Quantity, value: { ...leftValue, value: result } }];
    } else {
      return [toTypedValue(result)];
    }
  }
}

export class ConcatAtom extends InfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('&', left, right);
  }

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

export class ContainsAtom extends InfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('contains', left, right);
  }

  eval(context: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    return booleanToTypedValue(leftValue.some((e) => e.value === rightValue[0].value));
  }
}

export class InAtom extends InfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('in', left, right);
  }

  eval(context: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    return booleanToTypedValue(rightValue.some((e) => e.value === leftValue[0].value));
  }
}

export class DotAtom extends InfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('.', left, right);
  }

  eval(context: TypedValue[]): TypedValue[] {
    return this.right.eval(this.left.eval(context));
  }

  toString(): string {
    return `${this.left.toString()}.${this.right.toString()}`;
  }
}

export class UnionAtom extends InfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('|', left, right);
  }

  eval(context: TypedValue[]): TypedValue[] {
    const leftResult = this.left.eval(context);
    const rightResult = this.right.eval(context);
    return removeDuplicates([...leftResult, ...rightResult]);
  }
}

export class EqualsAtom extends InfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('=', left, right);
  }

  eval(context: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    return fhirPathArrayEquals(leftValue, rightValue);
  }
}

export class NotEqualsAtom extends InfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('!=', left, right);
  }

  eval(context: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    return fhirPathNot(fhirPathArrayEquals(leftValue, rightValue));
  }
}

export class EquivalentAtom extends InfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('~', left, right);
  }

  eval(context: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    return fhirPathArrayEquivalent(leftValue, rightValue);
  }
}

export class NotEquivalentAtom extends InfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('!~', left, right);
  }

  eval(context: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    return fhirPathNot(fhirPathArrayEquivalent(leftValue, rightValue));
  }
}

export class IsAtom extends InfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('is', left, right);
  }

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
 * Returns true if both operands evaluate to true,
 * false if either operand evaluates to false,
 * and the empty collection otherwise.
 */
export class AndAtom extends InfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('and', left, right);
  }

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

export class OrAtom extends InfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('or', left, right);
  }

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
 * and the empty collection otherwise.
 */
export class XorAtom extends InfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('xor', left, right);
  }

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
  constructor(public readonly name: string, public readonly args: Atom[]) {}
  eval(context: TypedValue[]): TypedValue[] {
    const impl = functions[this.name];
    if (!impl) {
      throw new Error('Unrecognized function: ' + this.name);
    }
    return impl(context, ...this.args);
  }

  toString(): string {
    return `${this.name}(${this.args.map((arg) => arg.toString()).join(', ')})`;
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

  toString(): string {
    return `${this.left.toString()}[${this.expr.toString()}]`;
  }
}
