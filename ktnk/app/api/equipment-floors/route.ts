import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
export async function GET() {
  const { data, error } = await createServerClient().from("equipment_floor_master").select("id,name,sort_order").order("sort_order").order("name");
  if (error) return NextResponse.json({ error: "フロア一覧を取得できませんでした。" }, { status: 500 });
  return NextResponse.json({ floors: data ?? [] });
}
