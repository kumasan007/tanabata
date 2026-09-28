import test from "node:test";
import assert from "node:assert/strict";
import { normalizeEquipmentOrder, orderByFloor, reorderDestination } from "../lib/equipment-order.ts";

const floors = [{ id: "2f" }, { id: "1f" }];
const rows = [{ id: "a", floor_id: "2f" }, { id: "b", floor_id: "2f" }, { id: "c", floor_id: "1f" }];

test("floor master order takes priority while preserving order within a floor", () => {
  assert.deepEqual(orderByFloor([rows[2], rows[1], rows[0]], floors).map(row => row.id), ["b", "a", "c"]);
});

test("within-floor moves do not request a floor change", () => {
  assert.equal(reorderDestination(rows, ["b", "a", "c"], "a"), null);
});

test("cross-floor moves identify the destination in either direction", () => {
  assert.equal(reorderDestination(rows, ["a", "c", "b"], "b"), "1f");
  assert.equal(reorderDestination(rows, ["a", "c", "b"], "c"), "2f");
  assert.equal(reorderDestination(rows, ["c", "a", "b"], "c"), "2f");
});

test("moving downward to the first row uses the actual drop target floor", () => {
  const descending = [
    { id: "4a", floor_id: "4f" },
    { id: "4b", floor_id: "4f" },
    { id: "3a", floor_id: "3f" },
    { id: "3b", floor_id: "3f" },
  ];
  assert.equal(reorderDestination(descending, ["4b", "4a", "3a", "3b"], "4a", "3a"), "3f");
});

test("cross-floor moves remain grouped in floor master order", () => {
  assert.deepEqual(normalizeEquipmentOrder(rows, ["a", "c", "b"], "b", "1f", floors), ["a", "c", "b"]);
  assert.deepEqual(normalizeEquipmentOrder(rows, ["a", "c", "b"], "c", "2f", floors), ["a", "c", "b"]);
  assert.deepEqual(normalizeEquipmentOrder(rows, ["c", "a", "b"], "c", "2f", floors), ["c", "a", "b"]);
});

test("within-floor reordering keeps the requested order", () => {
  assert.deepEqual(normalizeEquipmentOrder(rows, ["b", "a", "c"], "a", null, floors), ["b", "a", "c"]);
});
