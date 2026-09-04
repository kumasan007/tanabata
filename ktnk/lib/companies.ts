import { createServiceClient } from "@/lib/supabase";
import type { CompanyMaster } from "@/lib/types";

type CompanyMasterRecord = {
  primary_company: string;
  secondary_company: string | null;
  sort_order: number;
};

export async function getCompanyMaster(): Promise<CompanyMaster> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("company_master")
    .select("primary_company, secondary_company, sort_order")
    .order("sort_order", { ascending: true })
    .order("primary_company", { ascending: true })
    .order("secondary_company", { ascending: true, nullsFirst: true });

  if (error) {
    throw new Error(`Supabaseから会社マスタを取得できませんでした: ${error.message}`);
  }

  return buildCompanyMaster(data ?? []);
}

function buildCompanyMaster(rows: CompanyMasterRecord[]): CompanyMaster {
  const primaryCompanies: string[] = [];
  const secondariesByPrimary: Record<string, string[]> = {};

  for (const row of rows) {
    const primary = row.primary_company.trim();
    const secondary = row.secondary_company?.trim() ?? "";

    if (!primary) continue;

    if (!Object.prototype.hasOwnProperty.call(secondariesByPrimary, primary)) {
      primaryCompanies.push(primary);
      secondariesByPrimary[primary] = [];
    }

    if (secondary && !secondariesByPrimary[primary].includes(secondary)) {
      secondariesByPrimary[primary].push(secondary);
    }
  }

  return {
    primaryCompanies,
    secondariesByPrimary,
    loadedAt: new Date().toISOString(),
  };
}
