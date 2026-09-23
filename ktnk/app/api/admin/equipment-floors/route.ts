import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminFromRequest, createAdminServerClient } from "@/lib/supabase";
const idSchema = z.string().uuid();
const nameSchema = z.string().trim().min(1).max(30);
export async function GET(request: Request) {
  if (!assertAdminFromRequest(request)) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  const { data, error } = await createAdminServerClient().from("equipment_floor_master").select("id,name,sort_order").order("sort_order").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ floors: data ?? [] });
}
export async function POST(request: Request) {
  if (!assertAdminFromRequest(request)) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  const name = nameSchema.safeParse((await request.json()).name); if (!name.success) return NextResponse.json({ error: "フロア名を入力してください。" }, { status: 400 });
  const db = createAdminServerClient(); const { data: last } = await db.from("equipment_floor_master").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db.from("equipment_floor_master").insert({ name: name.data, sort_order: (last?.sort_order ?? -1) + 1 });
  if (error) return NextResponse.json({ error: error.code === "23505" ? "登録済みのフロアです。" : error.message }, { status: 409 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
export async function PATCH(request: Request) {
  if (!assertAdminFromRequest(request)) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  const body = await request.json(); const id = idSchema.safeParse(body.id); const name = nameSchema.safeParse(body.name);
  if (!id.success || !name.success) return NextResponse.json({ error: "入力内容が正しくありません。" }, { status: 400 });
  const { error } = await createAdminServerClient().from("equipment_floor_master").update({ name: name.data }).eq("id", id.data);
  if (error) return NextResponse.json({ error: error.code === "23505" ? "登録済みのフロアです。" : error.message }, { status: 409 });
  return NextResponse.json({ ok: true });
}
export async function DELETE(request: Request) {
  if (!assertAdminFromRequest(request)) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  const id = idSchema.safeParse(new URL(request.url).searchParams.get("id")); if (!id.success) return NextResponse.json({ error: "指定が正しくありません。" }, { status: 400 });
  const { error } = await createAdminServerClient().from("equipment_floor_master").delete().eq("id", id.data);
  if (error) return NextResponse.json({ error: error.code === "23503" ? "登録済み予定で使用中のため削除できません。" : error.message }, { status: 409 });
  return NextResponse.json({ ok: true });
}
