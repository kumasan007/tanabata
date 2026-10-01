import { createServerClient } from "@/lib/supabase";
import type { CompanyMaster, CompanyMasterRow } from "@/lib/types";
import { unstable_cache } from "next/cache";
import { DATA_CACHE_TAGS, invalidateCompanyData } from "@/lib/data-cache";
import { readAllRows } from "@/lib/read-all-rows";

const getCachedCompanyMasterRows = unstable_cache(async (): Promise<CompanyMasterRow[]> => {
  const supabase = createServerClient();
  const { data, error } = await readAllRows(supabase
    .from("company_master")
    .select("id, primary_company, secondary_company, primary_trade_roles, sort_order")
    .order("sort_order", { ascending: true })
    .order("primary_company", { ascending: true })
    .order("secondary_company", { ascending: true, nullsFirst: true }).order("id"));

  if (error) {
    throw new Error(`Supabaseから会社マスタを取得できませんでした: ${error.message}`);
  }

  return data ?? [];
}, ["company-master-rows-v1"], {
  tags: [DATA_CACHE_TAGS.companies],
  revalidate: 60 * 60,
});

export async function getCompanyMasterRows(): Promise<CompanyMasterRow[]> {
  return getCachedCompanyMasterRows();
}

export async function getCompanyMaster(): Promise<CompanyMaster> {
  return buildCompanyMaster(await getCachedCompanyMasterRows());
}

export async function ensureSecondaryCompany(primaryCompany: string, secondaryCompany: string) {
  return ensureSecondaryCompanies(primaryCompany, [secondaryCompany]);
}

export async function ensureSecondaryCompanies(primaryCompany: string, secondaryCompanies: string[]) {
  const { data, error } = await createServerClient().rpc("ensure_secondary_companies", {
    p_primary: primaryCompany, p_secondaries: secondaryCompanies,
  });
  if (error) throw error;
  if (data) invalidateCompanyData();
  return data === true;
}

function buildCompanyMaster(rows: CompanyMasterRow[]): CompanyMaster {
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
