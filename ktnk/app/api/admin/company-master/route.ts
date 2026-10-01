import { NextResponse } from "next/server";
import { assertAdminFromRequest } from "@/lib/supabase";
import { createServerClient } from "@/lib/supabase";
import { invalidateCompanyData, invalidateAllOperationalData } from "@/lib/data-cache";
import { getCompanyMasterRows } from "@/lib/companies";
import { z } from "zod";
import { mutationErrorResponse } from "@/lib/mutation-error";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorized = assertAdminFromRequest(request);
  if (!authorized) {
    return NextResponse.json(
      { error: "管理者ログインが必要です。" },
      { status: 401 },
    );
  }

  try {
    return NextResponse.json({ rows: await getCompanyMasterRows() });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "会社マスタの取得に失敗しました。",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const authorized = assertAdminFromRequest(request);
  if (!authorized) {
    return NextResponse.json(
      { error: "管理者ログインが必要です。" },
      { status: 401 },
    );
  }

  try {
    const body = (await request.json()) as {
      primaryCompany?: string;
      secondaryCompany?: string;
      secondaryCompanies?: string[];
      primaryTradeRoles?: string[];
    };

    if (
      !body ||
      typeof body.primaryCompany !== "string" ||
      (body.secondaryCompanies !== undefined &&
        (!Array.isArray(body.secondaryCompanies) ||
          body.secondaryCompanies.some(
            (value) => typeof value !== "string",
          ))) ||
      (body.secondaryCompany !== undefined &&
        typeof body.secondaryCompany !== "string")
    ) {
      return NextResponse.json(
        { error: "会社名を文字列で入力してください。" },
        { status: 400 },
      );
    }
    const primaryCompany = body.primaryCompany.trim();
    const primaryTradeRoles = normalizeTradeRoles(body.primaryTradeRoles);
    const requestedSecondaries = Array.isArray(body.secondaryCompanies)
      ? body.secondaryCompanies
      : [body.secondaryCompany ?? ""];
    const secondaryCompanies = [
      ...new Set(
        requestedSecondaries
          .map((company) => String(company).trim())
          .filter(Boolean),
      ),
    ];

    if (!primaryCompany) {
      return NextResponse.json(
        { error: "一次会社を入力してください。" },
        { status: 400 },
      );
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
      .select("secondary_company, primary_trade_roles")
      .eq("primary_company", primaryCompany);
    if (findError) throw findError;

    if ((existingRows ?? []).length > 0 && secondaryCompanies.length === 0) {
      return NextResponse.json(
        {
          error: "登録済みの一次会社です。追加する二次会社を入力してください。",
        },
        { status: 409 },
      );
    }
    const requestedValues: Array<string | null> =
      secondaryCompanies.length > 0 ? secondaryCompanies : [null];
    const existingValues = new Set(
      (existingRows ?? []).map((row) => row.secondary_company ?? ""),
    );
    const newValues = requestedValues.filter(
      (company) => !existingValues.has(company ?? ""),
    );

    if (newValues.length === 0) {
      return NextResponse.json(
        { error: "入力された会社はすべて登録済みです。" },
        { status: 409 },
      );
    }

    const startOrder = (lastRow?.sort_order ?? -1) + 1;
    const rolesForPrimary = existingRows?.find(
      (row) => (row.primary_trade_roles?.length ?? 0) > 0,
    )?.primary_trade_roles ?? primaryTradeRoles;
    const { error } = await supabase.from("company_master").insert(
      newValues.map((secondaryCompany, index) => ({
        primary_company: primaryCompany,
        secondary_company: secondaryCompany,
        primary_trade_roles: rolesForPrimary,
        sort_order: startOrder + index,
      })),
    );

    if (error) throw error;

    invalidateCompanyData();

    return NextResponse.json({
      ok: true,
      addedCount: newValues.length,
      skippedCount: requestedValues.length - newValues.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "会社マスタの保存に失敗しました。",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const authorized = assertAdminFromRequest(request);
  if (!authorized) {
    return NextResponse.json(
      { error: "管理者ログインが必要です。" },
      { status: 401 },
    );
  }

  try {
    const body = (await request.json()) as {
      id?: string;
      primaryCompany?: string;
      secondaryCompany?: string;
      orderedIds?: string[];
      tradeRolesPrimaryCompany?: string;
      primaryTradeRoles?: string[];
    };
    const supabase = createServerClient();

    if (Array.isArray(body.orderedIds)) {
      const parsed = z.array(z.string().uuid()).safeParse(body.orderedIds);
      if (!parsed.success || new Set(parsed.data).size !== parsed.data.length) {
        return NextResponse.json(
          { error: "並び順の指定が正しくありません。" },
          { status: 400 },
        );
      }

      const { error } = await supabase.rpc("reorder_company_master", { p_ids: parsed.data });
      if (error) return mutationErrorResponse(error, "並び順を保存できませんでした。");

      invalidateCompanyData();
      return NextResponse.json({ ok: true });
    }

    if (typeof body.tradeRolesPrimaryCompany === "string") {
      const tradeRolesPrimaryCompany = body.tradeRolesPrimaryCompany.trim();
      const primaryCompany = body.primaryCompany?.trim() ?? "";
      if (!tradeRolesPrimaryCompany || !primaryCompany || !Array.isArray(body.primaryTradeRoles)) {
        return NextResponse.json(
          { error: "一次会社と職種を正しく入力してください。" },
          { status: 400 },
        );
      }

      const { data, error } = await supabase.rpc("update_company_master_atomically", {
        p_id: null, p_old_primary: tradeRolesPrimaryCompany, p_primary: primaryCompany,
        p_secondary: null, p_roles: normalizeTradeRoles(body.primaryTradeRoles),
      });
      if (error) throw error;
      if (!data) {
        return NextResponse.json(
          { error: "更新対象の一次会社が見つかりません。" },
          { status: 404 },
        );
      }

      invalidateAllOperationalData();
      return NextResponse.json({ ok: true });
    }

    const id = body.id?.trim();
    const primaryCompany = body.primaryCompany?.trim() ?? "";
    const secondaryCompany = body.secondaryCompany?.trim() ?? "";

    if (!id || !primaryCompany) {
      return NextResponse.json(
        { error: "更新対象と一次会社を入力してください。" },
        { status: 400 },
      );
    }

    let duplicateQuery = supabase
      .from("company_master")
      .select("id")
      .eq("primary_company", primaryCompany)
      .neq("id", id);
    duplicateQuery = secondaryCompany
      ? duplicateQuery.eq("secondary_company", secondaryCompany)
      : duplicateQuery.is("secondary_company", null);

    const { data: existing, error: findError } =
      await duplicateQuery.maybeSingle();
    if (findError) throw findError;
    if (existing) {
      return NextResponse.json(
        { error: "同じ会社マスタがすでに登録されています。" },
        { status: 409 },
      );
    }

    const { data, error } = await supabase.rpc("update_company_master_atomically", {
      p_id: id, p_old_primary: null, p_primary: primaryCompany,
      p_secondary: secondaryCompany || null, p_roles: null,
    });
    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: "更新対象の会社マスタが見つかりません。" },
        { status: 404 },
      );
    }

    invalidateAllOperationalData();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "会社マスタの更新に失敗しました。",
      },
      { status: 500 },
    );
  }
}

function normalizeTradeRoles(values: unknown) {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(values.map((value) => String(value).trim()).filter(Boolean)),
  ];
}

export async function DELETE(request: Request) {
  const authorized = assertAdminFromRequest(request);
  if (!authorized) {
    return NextResponse.json(
      { error: "管理者ログインが必要です。" },
      { status: 401 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim();

    const primaryCompany = searchParams.get("primaryCompany")?.trim();

    if ((!id && !primaryCompany) || (id && primaryCompany)) {
      return NextResponse.json(
        { error: "削除対象が指定されていません。" },
        { status: 400 },
      );
    }

    const supabase = createServerClient();
    const query = supabase.from("company_master").delete();
    const { data, error } = await (
      primaryCompany ? query.eq("primary_company", primaryCompany) : query.eq("id", id!)
    ).select("id");

    if (error) throw error;
    if (!data?.length) {
      return NextResponse.json(
        { error: "削除対象の会社マスタが見つかりません。" },
        { status: 404 },
      );
    }

    invalidateCompanyData();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "会社マスタの削除に失敗しました。",
      },
      { status: 500 },
    );
  }
}
