import { Atom, AtomContext, InfixOperatorAtom, PrefixOperatorAtom } from '../fhirlexer/parse';
import { PropertyType, TypedValue, isResource } from '../types';
import { functions } from './functions';
import {
  booleanToTypedValue,
  fhirPathArrayEquals,
  fhirPathArrayEquivalent,
  fhirPathArrayNotEquals,
  fhirPathIs,
  fhirPathNot,
  getTypedPropertyValue,
  isQuantity,
  removeDuplicates,
  singleton,
  toTypedValue,
} from './utils';

export class FhirPathAtom implements Atom {
  constructor(
    public readonly original: string,
    public readonly child: Atom
  ) {}

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    try {
      if (input.length > 0) {
        const result = [];
        for (const e of input) {
          result.push(this.child.eval({ parent: context, variables: { $this: e } }, [e]));
        }
        return result.flat();
      } else {
        return this.child.eval(context, []);
      }
    } catch (error) {
      throw new Error(`FhirPathError on "${this.original}": ${error}`, { cause: error });
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
  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    if (this.name === '$this') {
      return input;
    }
    const variableValue = this.getVariable(context);
    if (variableValue) {
      return [variableValue];
    }
    if (this.name.startsWith('%')) {
      throw new Error(`Undefined variable ${this.name}`);
    }
    return input.flatMap((e) => this.evalValue(e)).filter((e) => e?.value !== undefined) as TypedValue[];
  }

  private getVariable(context: AtomContext): TypedValue | undefined {
    const value = context.variables[this.name];
    if (value !== undefined) {
      return value;
    }

    if (context.parent) {
      return this.getVariable(context.parent);
    }

    return undefined;
  }

  private evalValue(typedValue: TypedValue): TypedValue[] | TypedValue | undefined {
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
  constructor(
    operator: string,
    child: Atom,
    public readonly impl: (x: TypedValue[]) => TypedValue[]
  ) {
    super(operator, child);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    return this.impl(this.child.eval(context, input));
  }

  toString(): string {
    return this.operator + this.child.toString();
  }
}

export class AsAtom extends InfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('as', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    return functions.ofType(context, this.left.eval(context, input), this.right);
  }
}

export abstract class BooleanInfixOperatorAtom extends InfixOperatorAtom {
  abstract eval(context: AtomContext, input: TypedValue[]): TypedValue[];
}

export class ArithemticOperatorAtom extends BooleanInfixOperatorAtom {
  constructor(
    operator: string,
    left: Atom,
    right: Atom,
    public readonly impl: (x: number, y: number) => number | boolean
  ) {
    super(operator, left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const leftEvalResult = this.left.eval(context, input);
    if (leftEvalResult.length !== 1) {
      return [];
    }
    const rightEvalResult = this.right.eval(context, input);
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

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context, input);
    const rightValue = this.right.eval(context, input);
    const result = [...leftValue, ...rightValue];
    if (result.length > 0 && result.every((e) => typeof e.value === 'string')) {
      return [{ type: PropertyType.string, value: result.map((e) => e.value as string).join('') }];
    }
    return result;
  }
}

export class ContainsAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('contains', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context, input);
    const rightValue = this.right.eval(context, input);
    return booleanToTypedValue(leftValue.some((e) => e.value === rightValue[0].value));
  }
}

export class InAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('in', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const left = singleton(this.left.eval(context, input));
    const right = this.right.eval(context, input);
    if (!left) {
      return [];
    }
    return booleanToTypedValue(right.some((e) => e.value === left.value));
  }
}

export class DotAtom extends InfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('.', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    return this.right.eval(context, this.left.eval(context, input));
  }

  toString(): string {
    return `${this.left.toString()}.${this.right.toString()}`;
  }
}

export class UnionAtom extends InfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('|', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const leftResult = this.left.eval(context, input);
    const rightResult = this.right.eval(context, input);
    return removeDuplicates([...leftResult, ...rightResult]);
  }
}

export class EqualsAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('=', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context, input);
    const rightValue = this.right.eval(context, input);
    return fhirPathArrayEquals(leftValue, rightValue);
  }
}

export class NotEqualsAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('!=', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context, input);
    const rightValue = this.right.eval(context, input);
    return fhirPathArrayNotEquals(leftValue, rightValue);
  }
}

export class EquivalentAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('~', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context, input);
    const rightValue = this.right.eval(context, input);
    return fhirPathArrayEquivalent(leftValue, rightValue);
  }
}

export class NotEquivalentAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('!~', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context, input);
    const rightValue = this.right.eval(context, input);
    return fhirPathNot(fhirPathArrayEquivalent(leftValue, rightValue));
  }
}

export class IsAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('is', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context, input);
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
export class AndAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('and', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const left = singleton(this.left.eval(context, input), 'boolean');
    const right = singleton(this.right.eval(context, input), 'boolean');
    if (left?.value === true && right?.value === true) {
      return booleanToTypedValue(true);
    }
    if (left?.value === false || right?.value === false) {
      return booleanToTypedValue(false);
    }
    return [];
  }
}

/**
 * 6.5.2. or
 * Returns false if both operands evaluate to false,
 * true if either operand evaluates to true,
 * and empty (`{ }`) otherwise:
 */
export class OrAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('or', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const left = singleton(this.left.eval(context, input), 'boolean');
    const right = singleton(this.right.eval(context, input), 'boolean');
    if (left?.value === false && right?.value === false) {
      return booleanToTypedValue(false);
    } else if (left?.value || right?.value) {
      return booleanToTypedValue(true);
    } else {
      return [];
    }
  }
}

/**
 * 6.5.4. xor
 * Returns true if exactly one of the operands evaluates to true,
 * false if either both operands evaluate to true or both operands evaluate to false,
 * and the empty collection otherwise.
 */
export class XorAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('xor', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const left = singleton(this.left.eval(context, input), 'boolean');
    const right = singleton(this.right.eval(context, input), 'boolean');
    if (!left || !right) {
      return [];
    }
    return booleanToTypedValue(left.value !== right.value);
  }
}

/**
 * 6.5.5. implies
 * Returns true if left is true and right is true,
 * true left is false and right true, false or empty
 * true left is empty
 */
export class ImpliesAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('implies', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const left = singleton(this.left.eval(context, input), 'boolean');
    const right = singleton(this.right.eval(context, input), 'boolean');
    if (right?.value === true || left?.value === false) {
      return booleanToTypedValue(true);
    } else if (!left || !right) {
      return [];
    }
    return booleanToTypedValue(false);
  }
}

export class FunctionAtom implements Atom {
  constructor(
    public readonly name: string,
    public readonly args: Atom[]
  ) {}
  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const impl = functions[this.name];
    if (!impl) {
      throw new Error('Unrecognized function: ' + this.name);
    }
    return impl(context, input, ...this.args);
  }

  toString(): string {
    return `${this.name}(${this.args.map((arg) => arg.toString()).join(', ')})`;
  }
}

export class IndexerAtom implements Atom {
  constructor(
    public readonly left: Atom,
    public readonly expr: Atom
  ) {}
  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const evalResult = this.expr.eval(context, input);
    if (evalResult.length !== 1) {
      return [];
    }
    const index = evalResult[0].value;
    if (typeof index !== 'number') {
      throw new Error(`Invalid indexer expression: should return integer}`);
    }
    const leftResult = this.left.eval(context, input);
    if (!(index in leftResult)) {
      return [];
    }
    return [leftResult[index]];
  }

  toString(): string {
    return `${this.left.toString()}[${this.expr.toString()}]`;
  }
}
