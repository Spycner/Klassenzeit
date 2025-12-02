import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = [
  { name: "Home", path: "/" },
  { name: "Dashboard", path: "/de/dashboard" },
  { name: "Teachers", path: "/de/teachers" },
  { name: "Subjects", path: "/de/subjects" },
  { name: "Rooms", path: "/de/rooms" },
  { name: "Classes", path: "/de/classes" },
  { name: "Time Slots", path: "/de/timeslots" },
  { name: "Timetable", path: "/de/timetable" },
  { name: "Settings", path: "/de/settings" },
  { name: "Not Found", path: "/de/nonexistent" },
];

test.describe("Accessibility", () => {
  for (const { name, path } of pages) {
    test(`${name} page has no accessibility violations`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
