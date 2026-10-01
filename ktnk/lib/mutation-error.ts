import { NextResponse } from "next/server";

const messages: Record<string, string> = {
  COMPANY_NOT_FOUND: "会社一覧が変更されています。最新の会社を選び直してください。",
  COMPANY_LIST_CHANGED: "会社一覧が変更されています。読み込み直してから並び替えてください。",
  SECONDARY_COMPANY_CHANGED: "二次会社の一覧が変更されています。最新の会社を選び直してください。",
  OPERATION_CHANGED: "他の人が変更しています。最新の内容を読み直してください。",
  ENTRY_CHANGED: "入場者情報が変更されています。最新の内容を読み直してください。",
  LEGACY_ENTRY: "複数人分の旧形式データは個人編集できません。",
};

export function mutationErrorResponse(error: unknown, fallback: string) {
  const value = error as { code?: string; message?: string } | null;
  const known = value?.message ? messages[value.message] : undefined;
  if (known) return NextResponse.json({ error: known, code: value?.message }, { status: 409 });
  if (value?.code === "PGRST202" || value?.code === "42883") {
    return NextResponse.json({ error: "更新用の追加SQL（202610010002_atomic_flows.sql）を実行してください。" }, { status: 503 });
  }
  if (value?.code === "23505") return NextResponse.json({ error: "変更先に登録済みのデータがあります。最新の内容を確認してください。" }, { status: 409 });
  return NextResponse.json({ error: fallback }, { status: 500 });
}
