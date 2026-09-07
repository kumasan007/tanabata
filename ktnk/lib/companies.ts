import { createServerClient } from "@/lib/supabase";
import type { CompanyMaster } from "@/lib/types";

type CompanyMasterRecord = {
  primary_company: string;
  secondary_company: string | null;
  primary_trade_roles: string[] | null;
  sort_order: number;
};

export async function getCompanyMaster(): Promise<CompanyMaster> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("company_master")
    .select("primary_company, secondary_company, primary_trade_roles, sort_order")
    .order("sort_order", { ascending: true })
    .order("primary_company", { ascending: true })
    .order("secondary_company", { ascending: true, nullsFirst: true });

  if (error) {
    throw new Error(`Supabaseから会社マスタを取得できませんでした: ${error.message}`);
  }

  return buildCompanyMaster(data ?? []);
}

export async function ensureSecondaryCompany(primaryCompany: string, secondaryCompany: string) {
  const db = createServerClient();
  const { data: rows, error } = await db
    .from("company_master")
    .select("secondary_company,primary_trade_roles,sort_order")
    .eq("primary_company", primaryCompany)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  if (!rows?.length) return false;

  if (!rows.some((row) => row.secondary_company === secondaryCompany)) {
    const { error: insertError } = await db.from("company_master").insert({
      primary_company: primaryCompany,
      secondary_company: secondaryCompany,
      primary_trade_roles: rows[0].primary_trade_roles ?? [],
      sort_order: Math.max(...rows.map((row) => row.sort_order)) + 1,
    });
    // 同時登録は会社ペアのユニーク制約に任せる。
    if (insertError && insertError.code !== "23505") throw insertError;
  }
  return true;
}

function buildCompanyMaster(rows: CompanyMasterRecord[]): CompanyMaster {
  const primaryCompanies: string[] = [];
  const secondariesByPrimary: Record<string, string[]> = {};
  const primaryTradeRolesByPrimary: Record<string, string[]> = {};

  for (const row of rows) {
    const primary = row.primary_company.trim();
    const secondary = row.secondary_company?.trim() ?? "";

    if (!primary) continue;

    if (!Object.prototype.hasOwnProperty.call(secondariesByPrimary, primary)) {
      primaryCompanies.push(primary);
      secondariesByPrimary[primary] = [];
      primaryTradeRolesByPrimary[primary] = row.primary_trade_roles ?? [];
    } else if (
      primaryTradeRolesByPrimary[primary].length === 0 &&
      (row.primary_trade_roles?.length ?? 0) > 0
    ) {
      primaryTradeRolesByPrimary[primary] = row.primary_trade_roles ?? [];
    }

    if (secondary && !secondariesByPrimary[primary].includes(secondary)) {
      secondariesByPrimary[primary].push(secondary);
    }
  }

  return {
    primaryCompanies,
    secondariesByPrimary,
    primaryTradeRolesByPrimary,
    loadedAt: new Date().toISOString(),
  };
}
