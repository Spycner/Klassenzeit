import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import {
  roomSuitabilityByRoomId,
  server,
  stundentafelEntriesByTafelId,
  teacherAvailabilityByTeacherId,
  teacherQualsByTeacherId,
  timeBlocksBySchemeId,
} from "./msw-handlers";

// jsdom does not implement matchMedia; next-themes calls it during mount.
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// jsdom does not implement Pointer Events APIs that Radix UI primitives
// (Select, Slider, etc.) rely on. Polyfill the few we need so component
// tests that open a Radix Select trigger don't blow up with
// "target.hasPointerCapture is not a function".
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = vi.fn();
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = vi.fn();
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  for (const key of Object.keys(stundentafelEntriesByTafelId)) {
    stundentafelEntriesByTafelId[key] = [];
  }
  for (const key of Object.keys(roomSuitabilityByRoomId)) {
    roomSuitabilityByRoomId[key] = [];
  }
  for (const key of Object.keys(timeBlocksBySchemeId)) {
    timeBlocksBySchemeId[key] = [];
  }
  for (const key of Object.keys(teacherQualsByTeacherId)) {
    teacherQualsByTeacherId[key] = [];
  }
  for (const key of Object.keys(teacherAvailabilityByTeacherId)) {
    teacherAvailabilityByTeacherId[key] = [];
  }
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
