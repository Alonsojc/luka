import { test as base } from "@playwright/test";

/**
 * Shared authenticated test fixture.
 *
 * The "setup" project already saves storageState, so app tests can navigate
 * directly to their target route. Avoid preloading /dashboard here because it
 * causes extra API traffic that can trip the global throttler in CI.
 */
export const test = base;

export { expect } from "@playwright/test";
