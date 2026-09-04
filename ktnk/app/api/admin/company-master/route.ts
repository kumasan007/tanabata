import { NextResponse } from "next/server";
import { assertAdminFromRequest } from "@/lib/supabase";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorized = assertAdminFromRequest(request);
  if (!authorized) {
    return NextResponse.json({ error: "管理者ログインが必要です。" }, { status: 401 });
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("company_master")
      .select("id, primary_company, secondary_company, sort_order")
      .order("sort_order", { ascending: true })
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
      secondaryCompanies?: string[];
    };

    const primaryCompany = (body.primaryCompany ?? "").trim();
    const requestedSecondaries = Array.isArray(body.secondaryCompanies)
      ? body.secondaryCompanies
      : [body.secondaryCompany ?? ""];
    const secondaryCompanies = [
      ...new Set(requestedSecondaries.map((company) => String(company).trim()).filter(Boolean)),
    ];

    if (!primaryCompany) {
      return NextResponse.json({ error: "一次会社を入力してください。" }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data: lastRow, error: orderError } = await supabase
      .from("company_master")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (orderError) throw orderError;

    const { data: existingRows, error: findError } = await supabase
      .from("company_master")
      .select("secondary_company")
      .eq("primary_company", primaryCompany);
    if (findError) throw findError;

    const requestedValues: Array<string | null> = secondaryCompanies.length > 0 ? secondaryCompanies : [null];
    const existingValues = new Set((existingRows ?? []).map((row) => row.secondary_company ?? ""));
    const newValues = requestedValues.filter((company) => !existingValues.has(company ?? ""));

    if (newValues.length === 0) {
      return NextResponse.json({ error: "入力された会社はすべて登録済みです。" }, { status: 409 });
    }

    const startOrder = (lastRow?.sort_order ?? -1) + 1;
    const { error } = await supabase.from("company_master").insert(
      newValues.map((secondaryCompany, index) => ({
        primary_company: primaryCompany,
        secondary_company: secondaryCompany,
        sort_order: startOrder + index,
      })),
    );

    if (error) throw error;
    return NextResponse.json({
      ok: true,
      addedCount: newValues.length,
      skippedCount: requestedValues.length - newValues.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "会社マスタの保存に失敗しました。",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const authorized = assertAdminFromRequest(request);
  if (!authorized) {
    return NextResponse.json({ error: "管理者ログインが必要です。" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      id?: string;
      primaryCompany?: string;
      secondaryCompany?: string;
      orderedIds?: string[];
    };
    const supabase = createServerClient();

    if (Array.isArray(body.orderedIds)) {
      const orderedIds = [...new Set(body.orderedIds.filter((id) => typeof id === "string" && id.trim()))];
      if (orderedIds.length !== body.orderedIds.length) {
        return NextResponse.json({ error: "並び順の指定が正しくありません。" }, { status: 400 });
      }

      const { data: rows, error: rowsError } = await supabase.from("company_master").select("id");
      if (rowsError) throw rowsError;

      const existingIds = new Set((rows ?? []).map((row) => row.id));
      if (orderedIds.length !== existingIds.size || orderedIds.some((id) => !existingIds.has(id))) {
        return NextResponse.json({ error: "会社一覧が更新されています。再読み込みしてください。" }, { status: 409 });
      }

      const results = await Promise.all(
        orderedIds.map((id, sortOrder) =>
          supabase.from("company_master").update({ sort_order: sortOrder }).eq("id", id),
        ),
      );
      const updateError = results.find((result) => result.error)?.error;
      if (updateError) throw updateError;

      return NextResponse.json({ ok: true });
    }

    const id = body.id?.trim();
    const primaryCompany = body.primaryCompany?.trim() ?? "";
    const secondaryCompany = body.secondaryCompany?.trim() ?? "";

    if (!id || !primaryCompany) {
      return NextResponse.json({ error: "更新対象と一次会社を入力してください。" }, { status: 400 });
    }

    let duplicateQuery = supabase
      .from("company_master")
      .select("id")
      .eq("primary_company", primaryCompany)
      .neq("id", id);
    duplicateQuery = secondaryCompany
      ? duplicateQuery.eq("secondary_company", secondaryCompany)
      : duplicateQuery.is("secondary_company", null);

    const { data: existing, error: findError } = await duplicateQuery.maybeSingle();
    if (findError) throw findError;
    if (existing) {
      return NextResponse.json({ error: "同じ会社マスタがすでに登録されています。" }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("company_master")
      .update({ primary_company: primaryCompany, secondary_company: secondaryCompany || null })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "更新対象の会社マスタが見つかりません。" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "会社マスタの更新に失敗しました。" },
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
    const id = searchParams.get("id")?.trim();

    if (!id) {
      return NextResponse.json({ error: "削除対象が指定されていません。" }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data, error } = await supabase.from("company_master").delete().eq("id", id).select("id").maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "削除対象の会社マスタが見つかりません。" }, { status: 404 });
    }

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
