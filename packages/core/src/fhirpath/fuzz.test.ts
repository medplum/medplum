// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { fc, test } from '@fast-check/jest';
import { evalFhirPath, parseFhirPath } from './parse';

describe('FHIRPath parser fuzz tests', () => {
  const arithmeticExpressionArb = fc.oneof(
    fc.integer({ min: -100, max: 100 }).map(String),
    fc
      .tuple(
        fc.constant('('),
        fc.oneof(fc.integer(), fc.integer()),
        fc.constantFrom('+', '-', '*', '/'),
        fc.integer({ min: -100, max: 100 }),
        fc.constant(')')
      )
      .map(([lp, left, op, right, rp]) => `${lp}${left} ${op} ${right}${rp}`)
  );

  const fhirResourceArb = fc.record({
    resourceType: fc.constant('Patient'),
    name: fc.array(
      fc.record({
        given: fc.array(fc.string()),
        family: fc.string(),
      })
    ),
    birthDate: fc.date().map((d) => {
      try {
        return d.toISOString().split('T')[0];
      } catch (_err) {
        return undefined;
      }
    }),
  });

  const options = { numRuns: 1000 };

  test.prop([arithmeticExpressionArb], options)('Parser does not crash on valid arithmetic expressions', (expr) => {
    expect(() => parseFhirPath(expr)).not.toThrow();
  });

  test.prop([arithmeticExpressionArb], options)('Missing closing parenthesis throws a parse error', (expr) => {
    const corruptedExpr = `(${expr}`;
    fc.pre(expr.includes(')'));
    expect(() => parseFhirPath(corruptedExpr)).toThrow(/Parse error|Invalid/);
  });

  test.prop([fc.integer(), fc.integer(), fc.integer()], options)(
    'Arithmetic parser with nested parentheses evaluates correctly',
    (a, b, c) => {
      const expr = `(${a} + ${b}) * ${c}`;
      const result = evalFhirPath(expr, []);
      expect(result).toStrictEqual([(a + b) * c]);
    }
  );

  test.prop([fhirResourceArb], options)('Parser does not crash on valid FHIRPath expressions', (resource) => {
    const expr = 'Patient.name.given';
    expect(() => evalFhirPath(expr, [resource])).not.toThrow();
  });

  test.prop([fhirResourceArb], options)('FHIRPath substring function works correctly', (resource) => {
    const expr = 'Patient.name.given.first().substring(0, 1)';
    const result = evalFhirPath(expr, [resource]);
    const expected = resource.name?.find((n) => n.given && n.given.length > 0)?.given?.[0]?.substring(0, 1);
    if (expected) {
      expect(result).toStrictEqual([expected]);
    } else {
      expect(result).toStrictEqual([]);
    }
  });
});
