/**
 * Custom Playwright test fixtures for API tests.
 *
 * Sets up worker-specific test user credentials to avoid Keycloak brute force
 * protection being triggered during parallel test execution.
 */

import { test as base } from "@playwright/test";
import { setWorkerIndex } from "./auth";

/**
 * Extended test with automatic worker index setup.
 * Each parallel worker gets assigned a unique test user from the pool.
 */
export const test = base.extend({
  // Auto-use fixture that runs before each test file
  workerSetup: [
    async ({}, use, testInfo) => {
      // Set worker index for this worker's auth module instance
      setWorkerIndex(testInfo.parallelIndex);
      await use();
    },
    { auto: true, scope: "worker" },
  ],
});

export { expect } from "@playwright/test";
