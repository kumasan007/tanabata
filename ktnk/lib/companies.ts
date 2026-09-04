import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { CompanyMaster } from "@/lib/types";
import { createServiceClient } from "@/lib/supabase";

type CacheEntry = {
  data: CompanyMaster;
  expiresAt: number;
};

type CompanyRow = Record<string, string>;

type CompanySource =
  | { format: "csv"; text: string }
  | { format: "xlsx"; buffer: ArrayBuffer };

let cache: CacheEntry | null = null;

const CACHE_MS = 10 * 60 * 1000;

export async function getCompanyMaster(force = false): Promise<CompanyMaster> {
  const now = Date.now();
  if (!force && cache && cache.expiresAt > now) {
    return cache.data;
  }

  try {
    const supabaseData = await loadCompanyMasterFromSupabase();
    if (supabaseData) {
      cache = {
        data: supabaseData,
        expiresAt: now + CACHE_MS,
      };
      return supabaseData;
    }
  } catch (error) {
    // Ignore DB errors and fall back to the legacy external file source.
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
        const source = await fetchCompanySource(candidateUrl);
        const data = source.format === "csv" ? parseCompanyCsv(source.text) : parseCompanyWorkbook(readWorkbookRows(source.buffer));
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

async function loadCompanyMasterFromSupabase(): Promise<CompanyMaster | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("company_master")
    .select("primary_company, secondary_company, sort_order")
    .order("sort_order", { ascending: true })
    .order("primary_company", { ascending: true })
    .order("secondary_company", { ascending: true, nullsFirst: true });

  if (error) throw error;
  if (!data || data.length === 0) return null;

  return buildCompanyMaster(
    data.map((row) => ({
      "一次会社": row.primary_company ?? "",
      "二次会社": row.secondary_company ?? "",
    })),
  );
}

export function parseCompanyCsv(csvText: string): CompanyMaster {
  const result = Papa.parse<CompanyRow>(normalizeCsvText(csvText), {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    throw new Error(result.errors[0]?.message ?? "CSV parse failed.");
  }

  return buildCompanyMaster(result.data);
}

export function parseCompanyWorkbook(rows: Record<string, unknown>[]): CompanyMaster {
  return buildCompanyMaster(rows.map(normalizeCompanyRow));
}

function buildCompanyMaster(rows: CompanyRow[]): CompanyMaster {
  const primaryCompanies: string[] = [];
  const secondariesByPrimary: Record<string, string[]> = {};

  for (const row of rows) {
    const primary = (row["一次会社"] ?? "").trim();
    const secondary = (row["二次会社"] ?? "").trim();

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

function normalizeCompanyRow(row: Record<string, unknown>): CompanyRow {
  const normalized: CompanyRow = {};

  for (const [key, value] of Object.entries(row)) {
    normalized[String(key).trim()] = value == null ? "" : String(value).trim();
  }

  return normalized;
}

function normalizeCsvText(csvText: string) {
  return csvText
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/(^|,)[\t ]+"/gm, '$1"')
    .replace(/"[\t ]+(?=,|\n|$)/g, '"');
}

async function fetchCompanySource(url: string): Promise<CompanySource> {
  const first = await fetchSource(url);

  if (looksLikeHtml(first.text, first.contentType)) {
    try {
      const boxDownloadUrl = resolveBoxSharedDownloadUrl(url, first.text);
      if (!boxDownloadUrl) throw new Error("Box download URL not found.");

      const second = await fetchSource(boxDownloadUrl);
      if (looksLikeHtml(second.text, second.contentType)) {
        throw new Error("Boxの共有ページから会社マスタを取得しましたが、CSV/ExcelではなくHTMLが返りました。Box側でダウンロード許可を確認してください。");
      }

      return sourceFromResponse(second);
    } catch (error) {
      if (looksLikeSharePointUrl(url)) {
        return await fetchCompanySourceFromGraph(url);
      }
      throw error;
    }
  }

  return sourceFromResponse(first);
}

export function encodeMicrosoftShareUrlForGraph(rawUrl: string) {
  if (!looksLikeSharePointUrl(rawUrl)) {
    return null;
  }

  return Buffer.from(rawUrl).toString("base64url").replace(/=+$/, "");
}

async function fetchCompanySourceFromGraph(url: string): Promise<CompanySource> {
  const token = await getMicrosoftGraphAccessToken();
  const encodedShareUrl = encodeMicrosoftShareUrlForGraph(url);

  if (!encodedShareUrl) {
    throw new Error("Microsoft Graph に対応していないURLです。SharePoint/OneDriveの共有リンクを指定してください。");
  }

  const itemResponse = await fetch(`https://graph.microsoft.com/v1.0/shares/u!${encodedShareUrl}/driveItem`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!itemResponse.ok) {
    const body = await itemResponse.text();
    throw new Error(`Microsoft Graph で共有ファイルを取得できませんでした: ${itemResponse.status} ${body}`);
  }

  const item = (await itemResponse.json()) as {
    file?: { mimeType?: string };
    name?: string;
    downloadUrl?: string;
    "@microsoft.graph.downloadUrl"?: string;
  };

  const downloadUrl = item["@microsoft.graph.downloadUrl"] ?? item.downloadUrl;
  if (!downloadUrl) {
    throw new Error("Microsoft Graph からダウンロードURLを取得できませんでした。共有権限とアプリ権限を確認してください。");
  }

  const fileResponse = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      "user-agent": "Mozilla/5.0 ktnk-schedule-app",
    },
  });

  if (!fileResponse.ok) {
    throw new Error(`Microsoft Graph からファイル本体の取得に失敗しました: ${fileResponse.status}`);
  }

  const buffer = await fileResponse.arrayBuffer();
  const contentType = fileResponse.headers.get("content-type");
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer.slice(0, 2048));

  return sourceFromResponse({
    text,
    buffer,
    contentType,
    url: downloadUrl,
  });
}

async function getMicrosoftGraphAccessToken() {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft Graph を使うには MICROSOFT_TENANT_ID / MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET を設定してください。");
  }

  const tokenResponse = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text();
    throw new Error(`Microsoft Graph のトークン取得に失敗しました: ${tokenResponse.status} ${body}`);
  }

  const tokenData = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenData.access_token) {
    throw new Error("Microsoft Graph のアクセストークンが返っていません。");
  }

  return tokenData.access_token;
}

function sourceFromResponse(response: { text: string; buffer: ArrayBuffer; contentType: string | null; url: string }): CompanySource {
  if (isExcelMimeType(response.contentType) || isExcelFileUrl(response.url) || looksLikeZipPreamble(response.buffer)) {
    return { format: "xlsx", buffer: response.buffer };
  }

  return { format: "csv", text: response.text };
}

function readWorkbookRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  if (!sheet) {
    return [];
  }

  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

async function fetchSource(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      accept: "text/csv, text/plain, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*",
      "user-agent": "Mozilla/5.0 ktnk-schedule-app",
    },
  });

  if (!response.ok) {
    throw new Error(`会社マスタの取得に失敗しました: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer.slice(0, 2048));

  return {
    text,
    buffer,
    contentType: response.headers.get("content-type"),
    url: response.url,
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

function isExcelMimeType(contentType: string | null) {
  return Boolean(
    contentType
      ?.toLowerCase()
      .match(/application\/vnd\.(ms-excel|openxmlformats-officedocument\.spreadsheetml\.sheet)|application\/excel|application\/xlsx|application\/xls/),
  );
}

function isExcelFileUrl(url: string) {
  return /\.(xlsx|xlsm|xls)$/i.test(url);
}

function looksLikeSharePointUrl(url: string) {
  return /sharepoint\.com|onedrive\.live\.com|mysharepoint\.com/i.test(url);
}

function looksLikeZipPreamble(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer.slice(0, 4));
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function looksLikeHtml(text: string, contentType: string | null) {
  const trimmed = text.trimStart().slice(0, 200).toLowerCase();
  return Boolean(contentType?.toLowerCase().includes("text/html")) || trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}
