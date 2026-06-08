// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithPath } from './withpath';
import { getPath as getLayerPath } from './withpath';

type Prettify<T> = { [K in keyof T]: T[K] } & {};
type Merge<Base, Top> = Prettify<Omit<Base, keyof Top> & Top>;
type Layer = WithPath<{}>;

export class LayeredDict<const T extends Record<string, unknown> = {}> {
  private readonly layers: Layer[];
  private readonly index: T;

  private constructor(layers: Layer[], index: T) {
    this.layers = layers;
    this.index = Object.freeze(index);
  }

  /**
   * Start an empty dict.
   *
   * @returns An empty LayeredDict
   */
  static empty(): LayeredDict {
    return new LayeredDict<{}>([], {});
  }

  /**
   * Create a new LayeredDict with an Override layer applied on top of this
   *
   * @param layer - the overrides to add to the dictionary
   * @returns a new LayeredDict
   */
  addLayer<L extends Layer>(layer: L): LayeredDict<Merge<T, L>> {
    const index = { ...this.index, ...layer };
    return new LayeredDict<Merge<T, L>>([...this.layers, layer], index);
  }

  /**
   * Create a new LayeredDict with an Override layer applied below all current layers
   *
   * @param layer - the values to add to the dictionary
   * @returns a new LayeredDict
   */
  prependLayer<L extends Layer>(layer: L): LayeredDict<Merge<L, T>> {
    const index = { ...layer, ...this.index };
    return new LayeredDict<Merge<L, T>>([layer, ...this.layers], index);
  }

  /**
   * Like addLayer, but for partial overrides that stay within the existing shape.
   * The layer may override a subset of keys; the result type remains T.
   *
   * @param layer - partial overrides to apply
   * @returns a new LayeredDict<T>
   */
  patchLayer(layer: WithPath<Partial<T>>): LayeredDict<T> {
    const index = { ...this.index, ...layer };
    return new LayeredDict<T>([...this.layers, layer], index);
  }

  getPath<K extends keyof T & string>(key: K): string {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i];
      if (Object.hasOwn(layer, key)) {
        return getLayerPath(layer);
      }
    }
    throw new Error(`Key "${key}" not present`);
  }

  get<K extends keyof T & string>(key: K): T[K] {
    return this.index[key];
  }

  /**
   * Asserts that the flattened value satisfies a narrower type, throwing if not.
   * Use when a runtime check is needed to promote an optional field to required.
   *
   * @param guard - an assertion function that throws if the value does not satisfy U
   * @returns this dict, re-typed as LayeredDict<U>
   */
  refine<U extends T>(guard: (flat: T) => asserts flat is U): LayeredDict<U> {
    guard(this.index);
    return this as unknown as LayeredDict<U>;
  }

  flatten(): T {
    return this.index;
  }
}
