export function MutationNotice({ message, onReload, busy = false }: { message: string; onReload?: () => void; busy?: boolean }) {
  if (!message) return null;
  return <div role="alert" className="notice-error mt-3">
    <p>{message}</p>
    {onReload && <button type="button" className="btn btn-secondary mt-3 w-full" disabled={busy} onClick={onReload}>
      {busy ? "読み込み中…" : "最新の内容を読み直す"}
    </button>}
  </div>;
}
