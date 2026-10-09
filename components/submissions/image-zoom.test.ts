import { expect, test } from "vitest";
import { MAX_WHEEL_FACTOR, wheelZoomFactor } from "./image-zoom";

test("one notch of a mouse wheel is a gentle step, not a jump", () => {
  const out = wheelZoomFactor(100);
  const into = wheelZoomFactor(-100);
  expect(out).toBeGreaterThan(0.8);
  expect(out).toBeLessThan(0.9);
  expect(into).toBeGreaterThan(1.1);
  expect(into).toBeLessThan(1.2);
});

test("a step is proportional to deltaY: a small pinch delta is a small change", () => {
  expect(wheelZoomFactor(-4)).toBeGreaterThan(1);
  expect(wheelZoomFactor(-4)).toBeLessThan(1.01);
  expect(wheelZoomFactor(-40)).toBeGreaterThan(wheelZoomFactor(-4));
});

test("a wheel that counts in lines zooms like one that counts in pixels", () => {
  expect(wheelZoomFactor(-3, 1)).toBeCloseTo(wheelZoomFactor(-100, 0), 1);
});

test("one event never zooms by more than the limit, whatever the device reports", () => {
  expect(wheelZoomFactor(-100000)).toBe(MAX_WHEEL_FACTOR);
  expect(wheelZoomFactor(100000)).toBeCloseTo(1 / MAX_WHEEL_FACTOR);
  expect(wheelZoomFactor(0)).toBe(1);
});
