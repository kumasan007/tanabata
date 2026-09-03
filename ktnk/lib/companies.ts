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
    let lastError: unknown = null;

    for (const candidateUrl of companyCsvUrlCandidates(url)) {
      try {
        const csvText = await fetchCompanyCsvText(candidateUrl);
        const data = parseCompanyCsv(csvText);
        cache = {
          data,
          expiresAt: now + CACHE_MS,
        };
        return data;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  } catch (error) {
    if (cache) {
      return cache.data;
    }
    throw error;
  }
}

export function parseCompanyCsv(csvText: string): CompanyMaster {
  const result = Papa.parse<Record<string, string>>(normalizeCsvText(csvText), {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    throw new Error(result.errors[0]?.message ?? "CSV parse failed.");
  }

  const primaryCompanies: string[] = [];
  const secondariesByPrimary: Record<string, string[]> = {};
  const trades: string[] = [];
  const tradesByPrimary: Record<string, string[]> = {};

  for (const row of result.data) {
    const primary = row["一次会社"] ?? "";
    const secondary = row["二次会社"] ?? "";
    const rowTrades = splitTrades(row["職種"] ?? "");

    if (!primary) continue;

    if (!Object.prototype.hasOwnProperty.call(secondariesByPrimary, primary)) {
      primaryCompanies.push(primary);
      secondariesByPrimary[primary] = [];
      tradesByPrimary[primary] = [];
    }

    if (secondary && !secondariesByPrimary[primary].includes(secondary)) {
      secondariesByPrimary[primary].push(secondary);
    }

    for (const trade of rowTrades) {
      if (!trades.includes(trade)) {
        trades.push(trade);
      }
      if (!tradesByPrimary[primary].includes(trade)) {
        tradesByPrimary[primary].push(trade);
      }
    }
  }

  return {
    primaryCompanies,
    secondariesByPrimary,
    trades,
    tradesByPrimary,
    loadedAt: new Date().toISOString(),
  };
}

export function tradesTextForPrimaryCompany(master: CompanyMaster | null, primaryCompany: string) {
  return master?.tradesByPrimary?.[primaryCompany]?.join("・") ?? "";
}

function splitTrades(value: string) {
  return value
    .split(/[、,，／/・|｜]/)
    .map((trade) => trade.trim())
    .filter(Boolean);
}

function normalizeCsvText(csvText: string) {
  return csvText
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/(^|,)[\t ]+"/gm, '$1"')
    .replace(/"[\t ]+(?=,|\n|$)/g, '"');
}

async function fetchCompanyCsvText(url: string) {
  const first = await fetchText(url);
  if (!looksLikeHtml(first.text, first.contentType)) {
    return first.text;
  }

  const boxDownloadUrl = resolveBoxSharedDownloadUrl(url, first.text);
  if (!boxDownloadUrl) {
    throw new Error("Boxの表示ページが返っています。CSV本体を取得できる共有ファイルURL、またはCSV本体の直接URLを設定してください。");
  }

  const second = await fetchText(boxDownloadUrl);
  if (looksLikeHtml(second.text, second.contentType)) {
    throw new Error("Boxの共有ページからCSV本体の取得を試しましたが、CSVではなくHTMLが返りました。Box側でダウンロード許可を確認してください。");
  }

  return second.text;
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      accept: "text/csv, text/plain, */*",
      "user-agent": "Mozilla/5.0 ktnk-schedule-app",
    },
  });

  if (!response.ok) {
    throw new Error(`Box CSV request failed: ${response.status}`);
  }

  return {
    text: await response.text(),
    contentType: response.headers.get("content-type"),
  };
}

function resolveBoxSharedDownloadUrl(url: string, htmlText: string) {
  const sharedName = extractBoxSharedName(url, htmlText);
  const fileId = extractBoxFileId(htmlText);

  if (!sharedName || !fileId) return null;

  const downloadUrl = new URL("https://app.box.com/index.php");
  downloadUrl.searchParams.set("rm", "box_download_shared_file");
  downloadUrl.searchParams.set("shared_name", sharedName);
  downloadUrl.searchParams.set("file_id", `f_${fileId}`);
  return downloadUrl.toString();
}

function extractBoxSharedName(url: string, htmlText: string) {
  try {
    const parsedUrl = new URL(url);
    const match = parsedUrl.hostname.endsWith("box.com") ? parsedUrl.pathname.match(/^\/s\/([^/?#]+)/) : null;
    if (match?.[1]) return match[1];
  } catch {
    // Fall back to the embedded Box payload.
  }

  return htmlText.match(/"sharedName"\s*:\s*"([^"]+)"/)?.[1] ?? null;
}

function extractBoxFileId(htmlText: string) {
  return (
    htmlText.match(/"itemID"\s*:\s*(\d+)/)?.[1] ??
    htmlText.match(/"preview_metadata"\s*:\s*\{[\s\S]*?"id"\s*:\s*"(\d+)"/)?.[1] ??
    htmlText.match(/"typedID"\s*:\s*"f_(\d+)"/)?.[1] ??
    null
  );
}

function companyCsvUrlCandidates(rawUrl: string) {
  const urls = [rawUrl];

  try {
    const url = new URL(rawUrl);
    const boxShareMatch = url.hostname.endsWith("box.com") ? url.pathname.match(/^\/s\/([^/?#]+)/) : null;

    if (boxShareMatch?.[1]) {
      const shareId = boxShareMatch[1];
      urls.push(`https://app.box.com/shared/static/${shareId}.csv`);
      urls.push(`https://app.box.com/shared/static/${shareId}`);
    }

    if (!url.searchParams.has("raw")) {
      const rawCandidate = new URL(rawUrl);
      rawCandidate.searchParams.set("raw", "1");
      urls.push(rawCandidate.toString());
    }
  } catch {
    // Ignore invalid URL variants and let fetch surface the original problem.
  }

  return [...new Set(urls)];
}

function looksLikeHtml(text: string, contentType: string | null) {
  const trimmed = text.trimStart().slice(0, 200).toLowerCase();
  return Boolean(contentType?.toLowerCase().includes("text/html")) || trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}
