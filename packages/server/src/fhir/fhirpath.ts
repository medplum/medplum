import { Resource } from '@medplum/core';

export function evalFhirPath(resource: Resource, expression: string): any[] {
  return new FhirPath(expression).eval(resource);
}

export class FhirPath {
  private readonly original: string;
  private readonly components: string[][];

  constructor(str: string) {
    this.original = str;

    const expressions = str.split(' | ');
    this.components = new Array(expressions.length);
    for (let i = 0; i < expressions.length; i++) {
      this.components[i] = expressions[i].split('.');
    }
  }

  eval(resource: Resource): any[] {
    const result: any[] = [];
    for (const component of this.components) {
      result.push(...this.evalExpression(resource, component));
    }
    return result.flat();
  }

  evalFirst(resource: Resource) {
    const values = this.eval(resource);
    return values.length === 0 ? undefined : values[0];
  }

  private evalExpression(resource: Resource, expression: string[]): any[] {
    let curr = [resource];

    for (const token of expression) {
      const next: any[] = [];
      for (const value of curr) {
        this.evalToken(value, token, next);
      }
      curr = next;
    }

    return curr;
  }

  private evalToken(value: any, token: string, next: any[]): void {
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      if (Number.isInteger(token)) {
        next.push(value[parseInt(token)]);
      } else {
        for (const child of value) {
          this.evalToken(child, token, next);
        }
      }
    } else if (typeof value === 'object') {
      if (value.resourceType === token) {
        next.push(value);
      } else {
        next.push(value[token]);
      }

    }
  }
}
