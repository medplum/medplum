import { stringify } from '../utils';
import { applyMaybeArray, fhirPathEquals, fhirPathIs, toBoolean } from './utils';

export interface Atom {
  eval(context: any): any;
}

export class FhirPathAtom implements Atom {
  constructor(
    public readonly original: string,
    public readonly child: Atom) { }

  eval(context: any): any[] {
    try {
      const result = applyMaybeArray(context, e => this.child.eval(e));
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
  constructor(public readonly value: any) { }
  eval(): any {
    return this.value;
  }
  toString(): string {
    return this.value.toString();
  }
}

export class SymbolAtom implements Atom {
  constructor(public readonly name: string) { }
  eval(context: any): any {
    return applyMaybeArray(context, e => {
      if (e.resourceType === this.name) {
        return e;
      }
      if (typeof e === 'object') {
        if (this.name in e) {
          return e[this.name];
        }
        if (this.name === 'value') {
          return e['valueQuantity'];
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
  constructor(
    public readonly child: Atom,
    public readonly impl: (x: any) => any) { }

  eval(context: any): any {
    return this.impl(this.child.eval(context));
  }
}

export class BinaryOperatorAtom implements Atom {
  constructor(
    public readonly left: Atom,
    public readonly right: Atom,
    public readonly impl: (x: any, y: any) => any) { }

  eval(context: any): any {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    return applyMaybeArray(leftValue, (value) => this.impl(value, rightValue));
  }

  toString(): string {
    return '(' + this.left.toString() + ' ' + this.impl.toString() + ' ' + this.right.toString() + ')';
  }
}

export class ConcatAtom implements Atom {
  constructor(
    public readonly left: Atom,
    public readonly right: Atom) { }

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
    return result;
  }

  toString(): string {
    return '(' + this.left.toString() + ' & ' + this.right.toString() + ')';
  }
}

export class ContainsAtom implements Atom {
  constructor(
    public readonly left: Atom,
    public readonly right: Atom) { }

  eval(context: any): any {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    const array = Array.isArray(leftValue) ? leftValue : [leftValue];
    return array.includes(rightValue);
  }

  toString(): string {
    return '(' + this.left.toString() + ' contains ' + this.right.toString() + ')';
  }
}

export class InAtom implements Atom {
  constructor(
    public readonly left: Atom,
    public readonly right: Atom) { }

  eval(context: any): any {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    const array = Array.isArray(rightValue) ? rightValue : [rightValue];
    return array.includes(leftValue);
  }

  toString(): string {
    return '(' + this.left.toString() + ' in ' + this.right.toString() + ')';
  }
}

export class DotAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) { }
  eval(context: any): Atom {
    return this.right.eval(this.left.eval(context));
  }
  toString() {
    return this.left.toString() + '.' + this.right.toString();
  }
}

export class UnionAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) { }
  eval(context: any): any {
    const leftResult = this.left.eval(context);
    const rightResult = this.right.eval(context);
    if (leftResult !== undefined && rightResult !== undefined) {
      return [leftResult, rightResult].flat();
    }
    return leftResult || rightResult;
  }
}

export class EqualsAtom implements Atom {
  constructor(
    public readonly left: Atom,
    public readonly right: Atom) { }

  eval(context: any): any {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    return fhirPathEquals(leftValue, rightValue);
  }
}

export class NotEqualsAtom implements Atom {
  constructor(
    public readonly left: Atom,
    public readonly right: Atom) { }

  eval(context: any): any {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    return !toBoolean(fhirPathEquals(leftValue, rightValue));
  }
}

export class EquivalentAtom implements Atom {
  constructor(
    public readonly left: Atom,
    public readonly right: Atom) { }

  eval(context: any): any {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    // TODO: equivalence is not order dependent
    // TODO: equivalence is not case sensitive
    return stringify(leftValue) === stringify(rightValue);
  }
}

export class NotEquivalentAtom implements Atom {
  constructor(
    public readonly left: Atom,
    public readonly right: Atom) { }

  eval(context: any): any {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    // TODO: equivalence is not order dependent
    // TODO: equivalence is not case sensitive
    return stringify(leftValue) !== stringify(rightValue);
  }
}

export class IsAtom implements Atom {
  constructor(
    public readonly left: Atom,
    public readonly right: Atom) { }

  eval(context: any): any {
    const typeName = (this.right as SymbolAtom).name;
    return applyMaybeArray(this.left.eval(context), e => fhirPathIs(e, typeName));
  }
}

export class OrAtom implements Atom {
  constructor(
    public readonly left: Atom,
    public readonly right: Atom) { }

  eval(context: any): any {
    const leftValue = this.left.eval(context);
    if (toBoolean(leftValue)) {
      return leftValue;
    }

    const rightValue = this.right.eval(context);
    if (toBoolean(rightValue)) {
      return rightValue;
    }

    return [];
  }
}

export class XorAtom implements Atom {
  constructor(
    public readonly left: Atom,
    public readonly right: Atom) { }

  eval(context: any): any {
    const leftValue = this.left.eval(context);
    const rightValue = this.right.eval(context);
    const leftBoolean = toBoolean(leftValue);
    const rightBoolean = toBoolean(rightValue);
    if (leftBoolean !== rightBoolean) {
      return true;
    }
    return [];
  }
}

export class FunctionAtom implements Atom {
  constructor(
    public readonly name: string,
    public readonly args: Atom[],
    public readonly impl: (context: any[], ...a: Atom[]) => any[]
  ) { }
  eval(context: any): any {
    const input = Array.isArray(context) ? context : [context];
    return this.impl(input, ...this.args);
  }
}
