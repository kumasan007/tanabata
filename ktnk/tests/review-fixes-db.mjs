// Optional isolated PostgreSQL regression runner. No production connection is used.
// Set KTNK_PGLITE_MODULE to an installed @electric-sql/pglite dist/index.js file.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const { PGlite } = await import(process.env.KTNK_PGLITE_MODULE
  ? pathToFileURL(process.env.KTNK_PGLITE_MODULE).href : "@electric-sql/pglite");
const db = new PGlite();
try {
  const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8").replaceAll("\r\n", "\n");
  const backupSchema = readFileSync(new URL("../supabase/migrations/20260907_add_daily_backups.sql", import.meta.url), "utf8").replaceAll("\r\n", "\n");
  await db.exec("create role anon; create role authenticated; create role service_role;");
  const tables = new Map([...schema.matchAll(/create table if not exists public\.(\w+) \([\s\S]*?\n\);/g)].map(match => [match[1], match[0]]));
  for (const name of ["company_master", "schedule_groups", "schedule_subcompanies", "new_entrant_records", "work_completion_reports",
    "equipment_floor_master", "schedule_equipment_requests", "aerial_work_vehicles", "tachiuma_floor_stocks", "tachiuma_units", "equipment_movements"]) {
    if (!tables.has(name)) throw new Error(`Missing table fixture: ${name}`);
    await db.exec(tables.get(name));
  }
  await db.exec(backupSchema.match(/create table if not exists public\.data_backups \([\s\S]*?\n\);/)[0]);
  await db.exec(`
    create unique index data_backups_one_automatic_per_day_idx on public.data_backups(backup_date) where source='automatic';
    create unique index company_pair_idx on public.company_master(primary_company,coalesce(secondary_company,''));
    alter table public.aerial_work_vehicles add column assigned_company text, add column notes text, add column sort_order integer not null default 0;
    alter table public.equipment_movements add column from_company text, add column to_company text, add column work_date date, add column vehicle_number text;
  `);
  for (const match of schema.split("-- 2026-10-01 review fixes")[0].matchAll(/create or replace function public\.save_schedule_atomically\([\s\S]*?\$\$;/g)) {
    await db.exec(match[0]);
  }
  const migration = readFileSync(new URL("../supabase/migrations/202610010001_review_fixes.sql", import.meta.url), "utf8");
  await db.exec(migration);
  // Repeat application must not reset revisions or fail on already-created objects.
  await db.exec(migration);
  await db.exec(`
    create trigger schedule_groups_set_updated_at before update on public.schedule_groups
      for each row execute function public.set_updated_at();
    create trigger new_entrant_records_set_updated_at before update on public.new_entrant_records
      for each row execute function public.set_updated_at();
  `);
  await db.exec(readFileSync(new URL("./review-fixes.sql", import.meta.url), "utf8"));
  const atomicMigration = readFileSync(new URL("../supabase/migrations/202610010002_atomic_flows.sql", import.meta.url), "utf8");
  await db.exec(atomicMigration);
  await db.exec(atomicMigration);
  await db.exec(readFileSync(new URL("./atomic-flows.sql", import.meta.url), "utf8"));
  for (const name of ["202610010003_completion_atomic.sql", "202610010004_optimize_equipment_board_reads.sql"]) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
  }
  await db.exec(`
    create index company_master_primary_idx on public.company_master(primary_company);
    create index schedule_groups_primary_company_idx on public.schedule_groups(primary_company);
    create index schedule_groups_work_date_idx on public.schedule_groups(work_date);
    create index new_entrant_records_entry_date_idx on public.new_entrant_records(entry_date);
    create unique index schedule_groups_work_date_primary_company_idx on public.schedule_groups(work_date,primary_company);
  `);
  const cleanup = readFileSync(new URL("../supabase/migrations/202610010005_sql_cleanup.sql", import.meta.url), "utf8");
  await db.exec(cleanup);
  await db.exec(cleanup);
  await db.exec(readFileSync(new URL("./sql-cleanup.sql", import.meta.url), "utf8"));
  await db.exec(schema.match(/create or replace function public\.save_equipment_vehicle\([\s\S]*?\$\$;/)[0]);
  const capacity = readFileSync(new URL("../supabase/migrations/202610010006_vehicle_assignment_capacity.sql", import.meta.url), "utf8");
  await db.exec(capacity);
  await db.exec(capacity);
  await db.exec(readFileSync(new URL("./vehicle-assignment-capacity.sql", import.meta.url), "utf8"));
  // The database writer must choose the same visible assignments as the board.
  const exports = {};
  const { outputText } = ts.transpileModule(readFileSync(new URL("../lib/equipment-assignment.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  runInNewContext(outputText, { exports });
  const floor = "00000000-0000-0000-0000-000000000001";
  const otherFloor = "00000000-0000-0000-0000-000000000002";
  const ids = [1, 2, 3, 4].map(id => `10000000-0000-0000-0000-${String(id).padStart(12, "0")}`);
  const vehicles = ids.map((id, sort_order) => ({ id, floor_id: floor, assigned_company: "A", vehicle_number: String(sort_order + 1), sort_order }));
  const requests = [{ equipment_type: "aerial_work_vehicle", floor_id: floor, company: "A", requested_count: 3 }];
  const used = (id, company, date, hour, toFloor = floor) => ({ vehicle_id: id, to_company: company, to_floor_id: toFloor, work_date: date, moved_at: `${date}T${hour}:00:00Z` });
  for (const history of [
    [],
    ids.map((id, index) => used(id, "A", "2026-10-01", `0${index + 1}`)),
    [used(ids[0], "A", "2026-09-30", "01"), used(ids[0], null, "2026-10-01", "02")],
    [used(ids[0], "A", "2026-09-30", "01"), used(ids[0], null, "2026-09-30", "02", otherFloor)],
    [used(ids[0], "A", "2026-09-29", "01"), used(ids[0], "B", "2026-09-30", "02")],
  ]) {
    const visible = exports.resolveVehicleAssignments(vehicles, requests, history, "2026-10-01")
      .filter(row => row.assigned_company).map(row => row.id).sort();
    const { rows } = await db.query("select vehicle_id from public.get_equipment_assignment_candidates($1::jsonb,$2::date) where assignment_rank<=requested_count", [{ vehicles, requests, history }, "2026-10-01"]);
    assert.deepEqual(rows.map(row => row.vehicle_id).sort(), [...visible]);
  }
  process.stdout.write("Database regression checks passed (backup, legacy restore, renames, revisions, history).\n");
} catch (error) {
  console.error(error.message, error.where ?? "");
  process.exitCode = 1;
} finally {
  await db.close();
}
