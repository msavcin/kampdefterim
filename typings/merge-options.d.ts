declare module 'merge-options' {
  /**
   * Minimal declaration to satisfy TypeScript when package.json "exports" blocks
   * resolution of the bundled index.d.ts. This mirrors the upstream shape:
   * `export = mergeOptions;`
   */
  function mergeOptions(...options: any[]): any;
  export = mergeOptions;
}
