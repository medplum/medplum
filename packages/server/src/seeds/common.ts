export interface RebuildOptions {
  /**
   * Whether the resources should be created in parallel.
   *
   * **WARNING: Can be CPU intensive and/or clog up the connection pool.**
   */
  parallel: boolean;
}

const defaultOptions = {
  parallel: false,
};

export function buildRebuildOptions(options?: Partial<RebuildOptions>): RebuildOptions {
  return { ...defaultOptions, ...options };
}
