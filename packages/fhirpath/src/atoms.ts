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
  eval(context: any): any;
}

export class FhirPathAtom implements Atom {
  constructor(public readonly original: string, public readonly child: Atom) {}

  eval(context: any): any[] {
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
  toString(): string {
    return this.child.toString();
  }
}

export class LiteralAtom implements Atom {
  constructor(public readonly value: any) {}
  eval(): any {
    return this.value;
  }
  toString(): string {
    return this.value.toString();
  }
}

export class SymbolAtom implements Atom {
  constructor(public readonly name: string) {}
  eval(context: any): any {
    if (this.name === '$this') {
      return context;
    }
    return applyMaybeArray(context, (e) => {
      if (e && typeof e === 'object') {
        if (e.resourceType === this.name) {
          return e;
        }
        if (this.name in e) {
          return e[this.name];
        }
        const propertyName = Object.keys(e).find((k) => k.startsWith(this.name));
        if (propertyName) {
          return e[propertyName];
        }
      }
      return undefined;
    });
  }
  toString(): string {
    return this.name;
  }
}

export class EmptySetAtom implements Atom {
  eval(): any {
    return [];
  }
}

export class UnaryOperatorAtom implements Atom {
  constructor(public readonly child: Atom, public readonly impl: (x: any) => any) {}

  eval(context: any): any {
    return this.impl(this.child.eval(context));
  }
}

export class BinaryOperatorAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom, public readonly impl: (x: any, y: any) => any) {}

  eval(context: any): any {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    return applyMaybeArray(leftValue, (value) => this.impl(value, rightValue));
  }

  toString(): string {
    return '(' + this.left.toString() + ' ' + this.impl.toString() + ' ' + this.right.toString() + ')';
  }
}

export class ArithemticOperatorAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom, public readonly impl: (x: any, y: any) => any) {}

  eval(context: any): any {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    if (isQuantity(leftValue) && isQuantity(rightValue)) {
      return {
        ...leftValue,
        value: this.impl(leftValue.value, rightValue.value),
      };
    } else {
      return this.impl(leftValue, rightValue);
    }
  }

  toString(): string {
    return '(' + this.left.toString() + ' ' + this.impl.toString() + ' ' + this.right.toString() + ')';
  }
}

export class ComparisonOperatorAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom, public readonly impl: (x: any, y: any) => any) {}

  eval(context: any): any {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    if (isQuantity(leftValue) && isQuantity(rightValue)) {
      return this.impl(leftValue.value, rightValue.value);
    } else {
      return this.impl(leftValue, rightValue);
    }
  }

  toString(): string {
    return '(' + this.left.toString() + ' ' + this.impl.toString() + ' ' + this.right.toString() + ')';
  }
}

export class ConcatAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: any): any {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    const result: any[] = [];
    const add = (value: any) => {
      if (value) {
        if (Array.isArray(value)) {
          result.push(...value);
        } else {
          result.push(value);
        }
      }
    };
    add(leftValue);
    add(rightValue);
    if (result.every((e) => typeof e === 'string')) {
      return result.join('');
    }
    return result;
  }

  toString(): string {
    return '(' + this.left.toString() + ' & ' + this.right.toString() + ')';
  }
}

export class ContainsAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: any): any {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    return ensureArray(leftValue).includes(rightValue);
  }

  toString(): string {
    return '(' + this.left.toString() + ' contains ' + this.right.toString() + ')';
  }
}

export class InAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}

  eval(context: any): any {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    return ensureArray(rightValue).includes(leftValue);
  }

  toString(): string {
    return '(' + this.left.toString() + ' in ' + this.right.toString() + ')';
  }
}

export class DotAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}
  eval(context: any): Atom {
    return this.right.eval(this.left.eval(context));
  }
  toString() {
    return this.left.toString() + '.' + this.right.toString();
  }
}

export class UnionAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) {}
  eval(context: any): any {
    const leftResult = this.left.eval(context);
    const rightResult = this.right.eval(context);
    let resultArray: any[];
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

  eval(context: any): any {
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

  eval(context: any): any {
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

  eval(context: any): any {
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

  eval(context: any): any {
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

  eval(context: any): any {
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

  eval(context: any): any {
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

  eval(context: any): any {
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

  eval(context: any): any {
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
    public readonly impl: (context: any[], ...a: Atom[]) => any[]
  ) {}
  eval(context: any): any {
    return this.impl(ensureArray(context), ...this.args);
  }
}
