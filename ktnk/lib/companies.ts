import Papa from "papaparse";
import type { CompanyMaster } from "@/lib/types";

type CacheEntry = {
  data: CompanyMaster;
  expiresAt: number;
};

let cache: CacheEntry | null = null;

const CACHE_MS = 10 * 60 * 1000;

export async function getCompanyMaster(force = false): Promise<CompanyMaster> {
  const now = Date.now();
  if (!force && cache && cache.expiresAt > now) {
    return cache.data;
  }

  const url = process.env.BOX_COMPANY_CSV_URL;
  if (!url) {
    if (cache) return cache.data;
    throw new Error("BOX_COMPANY_CSV_URL is not set.");
  }

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        accept: "text/csv, text/plain, */*",
      },
    });

    if (!response.ok) {
      throw new Error(`Box CSV request failed: ${response.status}`);
    }

    const csvText = await response.text();
    const data = parseCompanyCsv(csvText);
    cache = {
      data,
      expiresAt: now + CACHE_MS,
    };
    return data;
  } catch (error) {
    if (cache) {
      return cache.data;
    }
    throw error;
  }
}

export function parseCompanyCsv(csvText: string): CompanyMaster {
  const result = Papa.parse<Record<string, string>>(csvText.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    throw new Error(result.errors[0]?.message ?? "CSV parse failed.");
  }

  const primaryCompanies: string[] = [];
  const secondariesByPrimary: Record<string, string[]> = {};

  for (const row of result.data) {
    const primary = row["一次会社"] ?? "";
    const secondary = row["二次会社"] ?? "";

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
