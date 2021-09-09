
/**
 * Applies a function to single value or an array of values.
 * @param context The context which will be passed to the function.
 * @param fn The function to apply.
 * @returns The result of the function.
 */
export function applyMaybeArray(context: any, fn: (context: any) => any): any {
  if (context === undefined) {
    return undefined;
  }
  if (Array.isArray(context)) {
    return context.map(e => fn(e)).filter(e => !!e).flat();
  } else {
    return fn(context);
  }
}

/**
 * Converts any object into a boolean.
 * @param obj Any value or array of values.
 * @returns The converted boolean value according to FHIRPath rules.
 */
export function toBoolean(obj: any): boolean {
  if (Array.isArray(obj) && obj.length === 0) {
    return false;
  }
  return !!obj;
}

/**
 * Determines if two values are equal according to FHIRPath equality rules.
 * @param x The first value.
 * @param y The second value.
 * @returns True if equal.
 */
export function fhirPathEquals(x: any, y: any): boolean {
  // console.log('fhirPathEquals', x, y);
  if (x instanceof Date && y instanceof Date) {
    return x.toISOString() === y.toISOString();
  }
  if (typeof x === 'number' && typeof y === 'number') {
    return Math.abs(x - y) < 0.00001;
  }
  return x === y;
}

export function fhirPathIs(value: any, desiredType: any): boolean {
  // const desiredResourceType = (this.right as SymbolAtom).name;
  // return applyMaybeArray(this.left.eval(context), e => e?.resourceType === desiredResourceType ? e : undefined);
  // return true;

  if (typeof value === 'object' && value?.resourceType === desiredType) {
    return true;
  }

  if (typeof value === 'boolean' && desiredType === 'Boolean') {
    return true;
  }

  // const typeName = typeAtom.toString();
  // console.log('cody is', input, typeAtom, typeName);
  // if (typeName === 'System.Patient') {
  //   return input.map(() => false);
  // }
  // return input.map(() => true);

  return false;
}
