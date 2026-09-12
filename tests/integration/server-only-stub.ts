/**
 * Stands in for the `server-only` package under the integration test runner.
 *
 * The real package throws on import so a server module can never be bundled
 * into the browser. That guarantee belongs to the app build, which still uses
 * the real package; this stub exists only so a test can import a service.
 */
export {};
