import { compressElement, inflateElement } from './base-schema';
import { InternalSchemaElement } from './typeschema/types';

describe('BaseSchema', () => {
  test('Simple element', () => {
    const original: InternalSchemaElement = {
      path: 'x',
      description: 'y',
      min: 0,
      max: 1,
      type: [{ code: 'string' }],
    };

    const compressed = compressElement(original);
    expect(compressed).toMatchObject({
      type: [{ code: 'string' }],
    });

    const inflated = inflateElement('x', compressed);
    expect(inflated).toMatchObject({
      path: 'x',
      min: 0,
      max: 1,
      type: [{ code: 'string' }],
    });
  });

  test('Array element', () => {
    const original: InternalSchemaElement = {
      path: 'x',
      description: 'y',
      min: 1,
      max: Infinity,
      type: [{ code: 'string' }],
    };

    const compressed = compressElement(original);
    expect(compressed).toMatchObject({
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      type: [{ code: 'string' }],
    });

    const inflated = inflateElement('x', compressed);
    expect(inflated).toMatchObject({
      path: 'x',
      min: 1,
      max: Infinity,
      isArray: true,
      type: [{ code: 'string' }],
    });
  });

  test('Fixed array element', () => {
    const original: InternalSchemaElement = {
      path: 'x',
      description: 'y',
      min: 1,
      max: 3,
      type: [{ code: 'string' }],
    };

    const compressed = compressElement(original);
    expect(compressed).toMatchObject({
      min: 1,
      max: 3,
      type: [{ code: 'string' }],
    });

    const inflated = inflateElement('x', compressed);
    expect(inflated).toMatchObject({
      path: 'x',
      min: 1,
      max: 3,
      isArray: true,
      type: [{ code: 'string' }],
    });
  });
});
