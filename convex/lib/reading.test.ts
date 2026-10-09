import { expect, test } from "vitest";
import type { Reading } from "./pipeline";
import { readingLeaves } from "./reading";

test("every value in a Reading is a leaf with its path and the pages of its nearest object", () => {
  const reading: Reading = {
    submissionType: "invoice",
    _pages: [1, 2, 3],
    vehicle: { licensePlate: "OR18DH", mileageKm: 181250, _pages: [2], _unsure: ["mileageKm"] },
    tyreChanges: [
      { position: "2R1", removed: { serial: "6935", treadDepthMm: 3 }, _pages: [2, 3] },
      { position: "6", replaced: true },
    ],
    notes: null,
    customerReference: "",
  };

  expect(readingLeaves(reading)).toEqual([
    { path: "submissionType", text: "invoice", pages: [1, 2, 3] },
    { path: "vehicle.licensePlate", text: "OR18DH", pages: [2] },
    { path: "vehicle.mileageKm", text: "181250", pages: [2] },
    { path: "tyreChanges[0].position", text: "2R1", pages: [2, 3] },
    { path: "tyreChanges[0].removed.serial", text: "6935", pages: [2, 3] },
    { path: "tyreChanges[0].removed.treadDepthMm", text: "3", pages: [2, 3] },
    { path: "tyreChanges[1].position", text: "6", pages: [1, 2, 3] },
    { path: "tyreChanges[1].replaced", text: "true", pages: [1, 2, 3] },
  ]);
});
