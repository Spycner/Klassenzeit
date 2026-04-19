import { test as base, expect } from "@playwright/test";

type AutoResetFixtures = {
  resetBackend: undefined;
};

export const test = base.extend<AutoResetFixtures>({
  resetBackend: [
    async ({ request }, use) => {
      const response = await request.post("http://localhost:8000/__test__/reset");
      if (!response.ok()) {
        throw new Error(`Backend reset failed: ${response.status()} ${await response.text()}`);
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };
