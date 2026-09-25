import test from "node:test";
import assert from "node:assert/strict";
import { resolveVehicleAssignments } from "../lib/equipment-assignment.ts";

const vehicle = (id, floor = "1f", company = null, order = 0) => ({ id, vehicle_number: id, notes: null, sort_order: order, floor_id: floor, assigned_company: company, updated_at: "2026-09-25T00:00:00Z" });
const request = (company, floor = "1f", count = 1) => ({ equipment_type: "aerial_work_vehicle", floor_id: floor, requested_count: count, company });
const used = (vehicleId, company, date, floor = "1f", time = "00:00:00") => ({ vehicle_id: vehicleId, to_floor_id: floor, to_company: company, work_date: date, moved_at: `${date}T${time}Z` });

test("号車は空き日を挟んでも同じフロアで希望する直近会社へ戻る", () => {
  const result = resolveVehicleAssignments([vehicle("1")], [request("A社")], [used("1", "A社", "2026-09-01")], "2026-09-03");
  assert.equal(result[0].assigned_company, "A社");
});

test("直近会社が希望中なら優先し、希望がなければ以前の希望会社へ戻る", () => {
  const history = [used("1", "A社", "2026-09-01"), used("1", "B社", "2026-09-02")];
  assert.equal(resolveVehicleAssignments([vehicle("1")], [request("A社"), request("B社")], history, "2026-09-03")[0].assigned_company, "B社");
  assert.equal(resolveVehicleAssignments([vehicle("1")], [request("A社")], history, "2026-09-03")[0].assigned_company, "A社");
});

test("フロア移動日に割当を解除すると以前の会社を自動継続しない", () => {
  const history = [used("1", "A社", "2026-09-01", "1f"), used("1", null, "2026-09-02", "2f")];
  const result = resolveVehicleAssignments([vehicle("1", "2f")], [request("A社", "2f")], history, "2026-09-02");
  assert.equal(result[0].assigned_company, null);
});

test("希望台数を超える号車は会社へ自動割当しない", () => {
  const vehicles = [vehicle("1", "1f", null, 0), vehicle("2", "1f", null, 1)];
  const history = [used("1", "A社", "2026-09-01", "1f", "09:00:00"), used("2", "A社", "2026-09-01", "1f", "08:00:00")];
  const result = resolveVehicleAssignments(vehicles, [request("A社", "1f", 1)], history, "2026-09-03");
  assert.deepEqual(result.map(row => row.assigned_company), ["A社", null]);
});
