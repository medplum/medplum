// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { LayeredDict } from './layereddict';
import { withPath } from './withpath';

describe('types', () => {
  test('get() returns the value type from the layer, not unknown', () => {
    const dict = LayeredDict.empty().addLayer(withPath({ duration: 30 }, 'HS/1'));
    dict.get('duration') satisfies number;
  });

  test('get() preserves lower-layer types for keys absent from upper layers', () => {
    const dict = LayeredDict.empty()
      .addLayer(withPath({ alignmentInterval: 90 }, 'HS/1'))
      .addLayer(withPath({ duration: 60 }, 'Sched/2'));
    dict.get('alignmentInterval') satisfies number;
    dict.get('duration') satisfies number;
  });

  test('upper layer type takes precedence over lower layer type for the same key', () => {
    const dict = LayeredDict.empty()
      .addLayer(withPath({ duration: 30 }, 'HS/1'))
      .addLayer(withPath({ duration: 'sixty' }, 'Sched/2'));
    dict.get('duration') satisfies string;
    // @ts-expect-error duration is now string, not number
    dict.get('duration') satisfies number;
  });

  test('getPath() returns string', () => {
    const dict = LayeredDict.empty().addLayer(withPath({ duration: 30 }, 'HS/1'));
    dict.getPath('duration') satisfies string;
  });

  test('get() for a key absent from all layers is a compile error', () => {
    const dict = LayeredDict.empty().addLayer(withPath({ duration: 30 }, 'HS/1'));
    // @ts-expect-error 'missing' is not a key in the dict
    dict.get('missing');
  });

  test('getPath() for a key absent from all layers is a compile error', () => {
    const dict = LayeredDict.empty().addLayer(withPath({ duration: 30 }, 'HS/1'));
    // @ts-expect-error 'missing' is not a key in the dict
    expect(() => dict.getPath('missing')).toThrow();
  });

  test('addLayer() requires a WithPath-annotated object', () => {
    const dict = LayeredDict.empty();
    // @ts-expect-error plain objects must be wrapped with withPath() before passing to addLayer()
    dict.addLayer({ duration: 30 });
  });

  test('prependLayer() new keys are accessible and existing keys retain their type', () => {
    const dict = LayeredDict.empty()
      .addLayer(withPath({ duration: 30 }, 'HS/1'))
      .prependLayer(withPath({ timezone: 'America/New_York' }, 'Actor/1'));
    dict.get('duration') satisfies number;
    dict.get('timezone') satisfies string;
  });

  test('prependLayer() existing key type takes precedence over prepended key type', () => {
    const dict = LayeredDict.empty()
      .addLayer(withPath({ duration: 30 }, 'HS/1'))
      .prependLayer(withPath({ duration: 'sixty' }, 'Actor/1'));
    dict.get('duration') satisfies number;
    // @ts-expect-error duration is number from the existing layer, not string from the prepended layer
    dict.get('duration') satisfies string;
  });

  test('prependLayer() requires a WithPath-annotated object', () => {
    const dict = LayeredDict.empty().addLayer(withPath({ duration: 30 }, 'HS/1'));
    // @ts-expect-error plain objects must be wrapped with withPath() before passing to prependLayer()
    dict.prependLayer({ timezone: 'UTC' });
  });

  test('patchLayer() preserves the existing type', () => {
    const dict = LayeredDict.empty()
      .addLayer(withPath({ duration: 30, alignmentInterval: 60 }, 'HS/1'))
      .patchLayer(withPath({ duration: 90 }, 'Sched/2'));
    dict.get('duration') satisfies number;
    dict.get('alignmentInterval') satisfies number;
  });

  test('patchLayer() does not widen the return type', () => {
    // When merging in an optional property, we don't want the type system to
    // lose track of the property actually being present in the lower layer.
    const patch: { duration?: number | undefined } = {};

    const dict = LayeredDict.empty().addLayer(withPath({ duration: 30 }, 'HS/1'));
    const patched = dict.patchLayer(withPath(patch, 'Sched/2'));
    patched.get('duration') satisfies number;
  });

  test('refine() narrows the return type to the asserted type', () => {
    const dict = LayeredDict.empty().addLayer(withPath({ duration: 30 }, 'HS/1')) as LayeredDict<{ duration?: number }>;
    const refined = dict.refine((p): asserts p is { duration: number } => {
      if (p.duration === undefined) {
        throw new Error('required');
      }
    });
    refined.get('duration') satisfies number;
    // @ts-expect-error duration is now required (number), not optional (number | undefined)
    refined.get('duration') satisfies undefined;
  });

  test('from() returns the value type from the layer, not unknown', () => {
    const dict = LayeredDict.from(withPath({ duration: 30 }, 'HS/1'));
    dict.get('duration') satisfies number;
  });

  test('from() requires a WithPath-annotated object', () => {
    // @ts-expect-error plain objects must be wrapped with withPath() before passing to from()
    LayeredDict.from({ duration: 30 });
  });

  test('flatten() returns the merged type', () => {
    const dict = LayeredDict.empty()
      .addLayer(withPath({ duration: 30 }, 'HS/1'))
      .addLayer(withPath({ timezone: 'UTC' }, 'Sched/2'));
    dict.flatten() satisfies { duration: number; timezone: string };
  });
});

describe('LayeredDict', () => {
  describe('from()', () => {
    test('get() returns the value from the layer', () => {
      const dict = LayeredDict.from(withPath({ duration: 30 }, 'HealthcareService/1'));
      expect(dict.get('duration')).toBe(30);
    });

    test('getPath() returns the path of the layer', () => {
      const dict = LayeredDict.from(withPath({ duration: 30 }, 'HealthcareService/1'));
      expect(dict.getPath('duration')).toBe('HealthcareService/1');
    });

    test('is equivalent to empty().addLayer()', () => {
      const layer = withPath({ duration: 30 }, 'HealthcareService/1');
      const via_from = LayeredDict.from(layer);
      const via_empty = LayeredDict.empty().addLayer(layer);
      expect(via_from.flatten()).toMatchObject(via_empty.flatten());
      expect(via_from.getPath('duration')).toBe(via_empty.getPath('duration'));
    });

    test('can be further composed with addLayer()', () => {
      const dict = LayeredDict.from(withPath({ duration: 30 }, 'HealthcareService/1')).addLayer(
        withPath({ duration: 60 }, 'Schedule/2')
      );
      expect(dict.get('duration')).toBe(60);
      expect(dict.getPath('duration')).toBe('Schedule/2');
    });
  });

  describe('addLayer()', () => {
    test('returns a new instance', () => {
      const base = LayeredDict.empty();
      const dict = base.addLayer(withPath({ duration: 30 }, 'HealthcareService/1'));
      expect(dict).not.toBe(base);
    });

    test('does not mutate the original dict', () => {
      const base = LayeredDict.empty().addLayer(withPath({ duration: 30 }, 'HealthcareService/1'));
      base.addLayer(withPath({ duration: 60 }, 'Schedule/2'));
      expect(base.get('duration')).toBe(30);
      expect(base.getPath('duration')).toBe('HealthcareService/1');
    });
  });

  describe('get()', () => {
    test('returns the value from a single layer', () => {
      const dict = LayeredDict.empty().addLayer(withPath({ duration: 30 }, 'HealthcareService/1'));
      expect(dict.get('duration')).toBe(30);
    });

    test('later layers override earlier layers for the same key', () => {
      const dict = LayeredDict.empty()
        .addLayer(withPath({ duration: 30 }, 'HealthcareService/1'))
        .addLayer(withPath({ duration: 60 }, 'Schedule/2'));
      expect(dict.get('duration')).toBe(60);
    });

    test('keys absent from later layers are still accessible from earlier layers', () => {
      const dict = LayeredDict.empty()
        .addLayer(withPath({ duration: 30, alignmentInterval: 90 }, 'HealthcareService/1'))
        .addLayer(withPath({ duration: 60 }, 'Schedule/2'));
      expect(dict.get('alignmentInterval')).toBe(90);
    });
  });

  describe('getPath()', () => {
    test('returns the path of the layer that defined the key', () => {
      const dict = LayeredDict.empty().addLayer(withPath({ duration: 30 }, 'HealthcareService/123'));
      expect(dict.getPath('duration')).toBe('HealthcareService/123');
    });

    test('returns the path of the topmost layer when multiple layers define the same key', () => {
      const dict = LayeredDict.empty()
        .addLayer(withPath({ duration: 30 }, 'HealthcareService/1'))
        .addLayer(withPath({ duration: 60 }, 'Schedule/2'));
      expect(dict.getPath('duration')).toBe('Schedule/2');
    });

    test('traces a key back to the layer that defined it, even when higher layers exist', () => {
      const dict = LayeredDict.empty()
        .addLayer(withPath({ alignmentInterval: 90 }, 'HealthcareService/1'))
        .addLayer(withPath({ duration: 60 }, 'Schedule/2'));
      expect(dict.getPath('alignmentInterval')).toBe('HealthcareService/1');
    });

    test('throws when the key is not present in any layer', () => {
      const dict = LayeredDict.empty().addLayer(withPath({ duration: 30 }, 'HealthcareService/1'));
      // Type cast required to bypass compile-time key constraint
      expect(() => (dict as LayeredDict<any>).getPath('missing')).toThrow('Key "missing" not present');
    });
  });

  describe('prependLayer()', () => {
    test('returns a new instance', () => {
      const base = LayeredDict.empty().addLayer(withPath({ duration: 30 }, 'HealthcareService/1'));
      const dict = base.prependLayer(withPath({ timezone: 'America/New_York' }, 'Actor/1'));
      expect(dict).not.toBe(base);
    });

    test('does not mutate the original dict', () => {
      const base = LayeredDict.empty().addLayer(withPath({ duration: 30 }, 'HealthcareService/1'));
      base.prependLayer(withPath({ duration: 60 }, 'Actor/1'));
      expect(base.get('duration')).toBe(30);
    });

    test('prepended layer loses to existing layers for the same key', () => {
      const dict = LayeredDict.empty()
        .addLayer(withPath({ timezone: 'America/Chicago' }, 'HealthcareService/1'))
        .prependLayer(withPath({ timezone: 'America/New_York' }, 'Actor/1'));
      expect(dict.get('timezone')).toBe('America/Chicago');
    });

    test('prepended layer supplies keys absent from existing layers', () => {
      const dict = LayeredDict.empty()
        .addLayer(withPath({ duration: 30 }, 'HealthcareService/1'))
        .prependLayer(withPath({ timezone: 'America/New_York' }, 'Actor/1'));
      expect(dict.get('timezone')).toBe('America/New_York');
      expect(dict.get('duration')).toBe(30);
    });

    test('getPath() returns the path of the existing layer when both define the same key', () => {
      const dict = LayeredDict.empty()
        .addLayer(withPath({ timezone: 'America/Chicago' }, 'HealthcareService/1'))
        .prependLayer(withPath({ timezone: 'America/New_York' }, 'Actor/1'));
      expect(dict.getPath('timezone')).toBe('HealthcareService/1');
    });
  });

  describe('patchLayer()', () => {
    test('returns a new instance', () => {
      const base = LayeredDict.empty().addLayer(withPath({ duration: 30 }, 'HealthcareService/1'));
      const patched = base.patchLayer(withPath({ duration: 60 }, 'Schedule/2'));
      expect(patched).not.toBe(base);
    });

    test('does not mutate the original dict', () => {
      const base = LayeredDict.empty().addLayer(withPath({ duration: 30 }, 'HealthcareService/1'));
      base.patchLayer(withPath({ duration: 60 }, 'Schedule/2'));
      expect(base.get('duration')).toBe(30);
    });

    test('overrides a key present in an earlier layer', () => {
      const dict = LayeredDict.empty()
        .addLayer(withPath({ duration: 30, alignmentInterval: 60 }, 'HealthcareService/1'))
        .patchLayer(withPath({ duration: 90 }, 'Schedule/2'));
      expect(dict.get('duration')).toBe(90);
    });

    test('leaves keys not mentioned in the patch unchanged', () => {
      const dict = LayeredDict.empty()
        .addLayer(withPath({ duration: 30, alignmentInterval: 60 }, 'HealthcareService/1'))
        .patchLayer(withPath({ duration: 90 }, 'Schedule/2'));
      expect(dict.get('alignmentInterval')).toBe(60);
    });

    test('getPath() points to the patch layer for overridden keys', () => {
      const dict = LayeredDict.empty()
        .addLayer(withPath({ duration: 30 }, 'HealthcareService/1'))
        .patchLayer(withPath({ duration: 90 }, 'Schedule/2'));
      expect(dict.getPath('duration')).toBe('Schedule/2');
    });

    test('getPath() still points to the original layer for unpatched keys', () => {
      const dict = LayeredDict.empty()
        .addLayer(withPath({ duration: 30, alignmentInterval: 60 }, 'HealthcareService/1'))
        .patchLayer(withPath({ duration: 90 }, 'Schedule/2'));
      expect(dict.getPath('alignmentInterval')).toBe('HealthcareService/1');
    });
  });

  describe('refine()', () => {
    test('returns the same dict retyped when the guard passes', () => {
      // Cast to a plain type (without WithPath symbol) to match how LayeredDict
      // is used in production code, where the type parameter is explicit.
      const dict = LayeredDict.empty().addLayer(withPath({ duration: 30 }, 'HealthcareService/1')) as LayeredDict<{
        duration: number;
      }>;
      const refined = dict.refine((p): asserts p is { duration: number } => {
        if (p.duration === undefined) {
          throw new Error('duration required');
        }
      });
      expect(refined.get('duration')).toBe(30);
      expect(refined).toBe(dict);
    });

    test('throws the guard error when the assertion fails', () => {
      const dict = LayeredDict.empty().addLayer(withPath({}, 'HealthcareService/1')) as LayeredDict<{
        duration?: number;
      }>;
      expect(() =>
        dict.refine((p): asserts p is { duration: number } => {
          if (p.duration === undefined) {
            throw new Error('duration required');
          }
        })
      ).toThrow('duration required');
    });

    test('does not mutate the dict', () => {
      const dict = LayeredDict.empty().addLayer(withPath({ duration: 30 }, 'HealthcareService/1')) as LayeredDict<{
        duration: number;
      }>;
      dict.refine((_p): asserts _p is { duration: number } => {});
      expect(dict.get('duration')).toBe(30);
    });
  });

  describe('flatten()', () => {
    test('returns all keys from a single layer', () => {
      const dict = LayeredDict.empty().addLayer(
        withPath({ duration: 30, alignmentInterval: 60 }, 'HealthcareService/1')
      );
      expect(dict.flatten()).toMatchObject({ duration: 30, alignmentInterval: 60 });
    });

    test('later layers override earlier layers in the flattened result', () => {
      const dict = LayeredDict.empty()
        .addLayer(withPath({ duration: 30, alignmentInterval: 60 }, 'HealthcareService/1'))
        .addLayer(withPath({ duration: 90 }, 'Schedule/2'));
      expect(dict.flatten()).toMatchObject({ duration: 90, alignmentInterval: 60 });
    });

    test('returns an empty object for an empty dict', () => {
      expect(LayeredDict.empty().flatten()).toEqual({});
    });
  });
});
