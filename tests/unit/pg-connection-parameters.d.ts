/**
 * Ambient shim: @types/pg ships connection-parameters typings, but package
 * "exports" block `tsc` (moduleResolution bundler) from resolving
 * `pg/lib/connection-parameters.js`. Needed so playwright.config.ts typechecks.
 */
declare module "pg/lib/connection-parameters.js" {
  export default class ConnectionParameters {
    constructor(config?: string | Record<string, unknown>);
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string | (() => string);
    options?: string;
  }
}
