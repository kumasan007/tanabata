import { LoadingIndicator } from "@/components/loading-indicator";

export default function Loading() {
  return <main className="mx-auto min-h-[50vh] max-w-6xl px-4 py-8"><LoadingIndicator label="ページを読み込み中…" className="min-h-48" /></main>;
}
