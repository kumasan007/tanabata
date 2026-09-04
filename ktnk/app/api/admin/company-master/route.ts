import { NextResponse } from "next/server";
import { assertAdminFromRequest } from "@/lib/supabase";
import { createServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorized = assertAdminFromRequest(request);
  if (!authorized) {
    return NextResponse.json({ error: "管理者ログインが必要です。" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("company_master")
      .select("primary_company, secondary_company")
      .order("primary_company", { ascending: true })
      .order("secondary_company", { ascending: true, nullsFirst: true });

    if (error) throw error;
    return NextResponse.json({ rows: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "会社マスタの取得に失敗しました。",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const authorized = assertAdminFromRequest(request);
  if (!authorized) {
    return NextResponse.json({ error: "管理者ログインが必要です。" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      primaryCompany?: string;
      secondaryCompany?: string;
    };

    const primaryCompany = (body.primaryCompany ?? "").trim();
    const secondaryCompany = (body.secondaryCompany ?? "").trim();

    if (!primaryCompany) {
      return NextResponse.json({ error: "一次会社を入力してください。" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { error } = await supabase.from("company_master").insert([
      {
        primary_company: primaryCompany,
        secondary_company: secondaryCompany || null,
      },
    ]);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "会社マスタの保存に失敗しました。",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const authorized = assertAdminFromRequest(request);
  if (!authorized) {
    return NextResponse.json({ error: "管理者ログインが必要です。" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const primaryCompany = searchParams.get("primaryCompany")?.trim();
    const secondaryCompany = searchParams.get("secondaryCompany")?.trim() ?? "";

    if (!primaryCompany) {
      return NextResponse.json({ error: "削除対象が指定されていません。" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from("company_master")
      .delete()
      .eq("primary_company", primaryCompany)
      .eq("secondary_company", secondaryCompany || null);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "会社マスタの削除に失敗しました。",
      },
      { status: 500 },
    );
  }
}
