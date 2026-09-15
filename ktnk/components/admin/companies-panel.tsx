"use client";
import { useEffect, useMemo, useState } from "react";
import { GripVertical, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { CopyValue } from "@/components/copy-value";
import { LoadingIndicator } from "@/components/loading-indicator";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiFetch } from "@/lib/api-client";
import type { CompanyMasterRow } from "@/lib/types";
type CompanyGroup = {
    primaryCompany: string;
    primaryTradeRoles: string[];
    rows: CompanyMasterRow[];
};
export function CompaniesPanel({ refreshVersion = 0 }: {
    refreshVersion?: number;
}) {
    const { confirm, dialog: confirmationDialog } = useConfirmDialog();
    const [companyRows, setCompanyRows] = useState<CompanyMasterRow[]>([]);
    const [newPrimaryCompany, setNewPrimaryCompany] = useState("");
    const [newSecondaryCompanies, setNewSecondaryCompanies] = useState("");
    const [newPrimaryRoles, setNewPrimaryRoles] = useState("");
    const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
    const [editPrimaryCompany, setEditPrimaryCompany] = useState("");
    const [editSecondaryCompany, setEditSecondaryCompany] = useState("");
    const [editingPrimaryRoles, setEditingPrimaryRoles] = useState<string | null>(null);
    const [editPrimaryName, setEditPrimaryName] = useState("");
    const [editPrimaryRoles, setEditPrimaryRoles] = useState("");
    const [message, setMessage] = useState("");
    const [companyFetching, setCompanyFetching] = useState(true);
    const [companyLoading, setCompanyLoading] = useState(false);
    const [companyOrderDirty, setCompanyOrderDirty] = useState(false);
    const [draggedCompany, setDraggedCompany] = useState<{
        primary: string;
        rowId?: string;
    } | null>(null);
    const [dropTarget, setDropTarget] = useState<string | null>(null);
    const companyGroups = useMemo<CompanyGroup[]>(() => {
        const groups = new Map<string, CompanyMasterRow[]>();
        for (const row of companyRows) {
            const rows = groups.get(row.primary_company) ?? [];
            rows.push(row);
            groups.set(row.primary_company, rows);
        }
        return [...groups].map(([primaryCompanyName, rows]) => ({
            primaryCompany: primaryCompanyName,
            primaryTradeRoles: rows.find((row) => (row.primary_trade_roles?.length ?? 0) > 0)
                ?.primary_trade_roles ?? [],
            rows,
        }));
    }, [companyRows]);
    const addingToExistingPrimary = companyGroups.some((group) => group.primaryCompany === newPrimaryCompany.trim());
    useEffect(() => { setCompanyFetching(true); void refreshCompanyMaster().catch(error => setMessage(error instanceof Error ? error.message : "会社マスタの取得に失敗しました。")).finally(() => setCompanyFetching(false)); }, [refreshVersion]);
    async function refreshCompanyMaster() {
        const response = await apiFetch("/api/admin/company-master", {
            headers: { accept: "application/json" },
        });
        const body = await response.json();
        if (!response.ok) {
            setCompanyRows([]);
            throw new Error(body.error ?? "会社マスタの取得に失敗しました。");
        }
        setCompanyRows(body.rows ?? []);
    }
    function clearCompanyDrag() {
        setDraggedCompany(null);
        setDropTarget(null);
    }
    function dropCompany(primary: string, rowId?: string) {
        const source = draggedCompany;
        clearCompanyDrag();
        if (!source || companyLoading || editingCompanyId)
            return;
        if (source.rowId) {
            if (source.primary !== primary || !rowId || source.rowId === rowId)
                return;
            const group = companyGroups.find((item) => item.primaryCompany === primary);
            if (!group)
                return;
            const rows = [...group.rows];
            const from = rows.findIndex((row) => row.id === source.rowId);
            const to = rows.findIndex((row) => row.id === rowId);
            if (from < 0 || to < 0)
                return;
            rows.splice(to, 0, rows.splice(from, 1)[0]);
            stageCompanyOrder(companyGroups.flatMap((item) => item === group ? rows : item.rows));
        }
        else {
            if (rowId || source.primary === primary)
                return;
            const groups = [...companyGroups];
            const from = groups.findIndex((item) => item.primaryCompany === source.primary);
            const to = groups.findIndex((item) => item.primaryCompany === primary);
            if (from < 0 || to < 0)
                return;
            groups.splice(to, 0, groups.splice(from, 1)[0]);
            stageCompanyOrder(groups.flatMap((item) => item.rows));
        }
    }
    async function addCompanyMaster() {
        const primaryCompany = newPrimaryCompany.trim();
        const primaryTradeRoles = addingToExistingPrimary ? [] : parseRoleText(newPrimaryRoles);
        const secondaryCompanies = [
            ...new Set(newSecondaryCompanies
                .split(/\r?\n|,|、/)
                .map((company) => company.trim())
                .filter(Boolean)),
        ];
        if (!primaryCompany) {
            setMessage("一次会社を入力してください。");
            return;
        }
        const existing = companyRows.filter((row) => row.primary_company === primaryCompany);
        if (existing.length && secondaryCompanies.length === 0) {
            setMessage("登録済みの一次会社です。追加する二次会社を入力してください。");
            return;
        }
        if (existing.length &&
            secondaryCompanies.every((company) => existing.some((row) => row.secondary_company === company))) {
            setMessage("入力された二次会社はすべて登録済みです。");
            return;
        }
        setMessage("");
        setCompanyLoading(true);
        try {
            const response = await apiFetch("/api/admin/company-master", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    primaryCompany,
                    secondaryCompanies,
                    primaryTradeRoles,
                }),
            });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error ?? "会社マスタの追加に失敗しました。");
            setNewPrimaryCompany("");
            setNewSecondaryCompanies("");
            setNewPrimaryRoles("");
            await refreshCompanyMaster();
        }
        catch (error) {
            setMessage(error instanceof Error
                ? error.message
                : "会社マスタの追加に失敗しました。");
        }
        finally {
            setCompanyLoading(false);
        }
    }
    async function removeCompanyMaster(id: string, group?: CompanyGroup) {
        if (companyLoading)
            return;
        const confirmation = group
            ? `「${group.primaryCompany}」と配下の登録${group.rows.length}件を協力会社一覧から削除しますか？登録済みの作業予定は残ります。`
            : "この協力会社を一覧から削除しますか？";
        if (!await confirm("協力会社を削除しますか？", confirmation, "削除する"))
            return;
        const params = new URLSearchParams(group ? { primaryCompany: group.primaryCompany } : { id });
        setMessage("");
        setCompanyLoading(true);
        try {
            const response = await apiFetch(`/api/admin/company-master?${params.toString()}`, { method: "DELETE" });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error ?? "会社マスタの削除に失敗しました。");
            if (editingCompanyId === id || group?.rows.some((row) => row.id === editingCompanyId))
                setEditingCompanyId(null);
            await refreshCompanyMaster();
        }
        catch (error) {
            setMessage(error instanceof Error
                ? error.message
                : "会社マスタの削除に失敗しました。");
        }
        finally {
            setCompanyLoading(false);
        }
    }
    function startEditingCompany(row: CompanyMasterRow) {
        setEditingCompanyId(row.id);
        setEditPrimaryCompany(row.primary_company);
        setEditSecondaryCompany(row.secondary_company ?? "");
        setMessage("");
    }
    async function saveCompanyMaster() {
        if (!editingCompanyId || !editPrimaryCompany.trim()) {
            setMessage("一次会社を入力してください。");
            return;
        }
        setMessage("");
        setCompanyLoading(true);
        try {
            const response = await apiFetch("/api/admin/company-master", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    id: editingCompanyId,
                    primaryCompany: editPrimaryCompany,
                    secondaryCompany: editSecondaryCompany,
                }),
            });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error ?? "会社マスタの更新に失敗しました。");
            setEditingCompanyId(null);
            await refreshCompanyMaster();
        }
        catch (error) {
            setMessage(error instanceof Error
                ? error.message
                : "会社マスタの更新に失敗しました。");
        }
        finally {
            setCompanyLoading(false);
        }
    }
    async function savePrimaryTradeRoles() {
        if (!editingPrimaryRoles || !editPrimaryName.trim())
            return;
        setMessage("");
        setCompanyLoading(true);
        try {
            const response = await apiFetch("/api/admin/company-master", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    tradeRolesPrimaryCompany: editingPrimaryRoles,
                    primaryCompany: editPrimaryName,
                    primaryTradeRoles: parseRoleText(editPrimaryRoles),
                }),
            });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error ?? "職種の更新に失敗しました。");
            setEditingPrimaryRoles(null);
            await refreshCompanyMaster();
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : "職種の更新に失敗しました。");
        }
        finally {
            setCompanyLoading(false);
        }
    }
    function stageCompanyOrder(reordered: CompanyMasterRow[]) {
        setCompanyRows(reordered);
        setCompanyOrderDirty(true);
        setMessage("");
    }
    async function saveCompanyOrder() {
        const reordered = companyRows;
        setMessage("");
        setCompanyLoading(true);
        try {
            const response = await apiFetch("/api/admin/company-master", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ orderedIds: reordered.map((row) => row.id) }),
            });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error ?? "並び順の保存に失敗しました。");
            setCompanyOrderDirty(false);
            await refreshCompanyMaster();
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : "並び順の保存に失敗しました。");
        }
        finally {
            setCompanyLoading(false);
        }
    }
    return <>{message && <p role="alert" className="text-sm text-red-700">{message}</p>}<section className="panel grid gap-3 p-4 sm:p-4">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">協力会社一覧</h2>
              <p className="mt-1 text-sm text-slate-600">
                入力画面に表示する会社名と順番を管理します。
              </p>
            </div>
            <span className="rounded-md bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              一次 {companyGroups.length}社 / 登録 {companyRows.length}件
            </span>
          </div>

          <div className={`grid items-start gap-4 rounded-md bg-slate-50 p-4 ${addingToExistingPrimary ? "md:grid-cols-[1fr_1.5fr_auto]" : "md:grid-cols-[1fr_1fr_1.5fr_auto]"}`}>
            <label className="field">
              <span className="label">一次会社</span>
              <input className="input" id="add-company-primary" value={newPrimaryCompany} onChange={(event) => setNewPrimaryCompany(event.target.value)} placeholder="例: 山田設備"/>
            </label>
            {!addingToExistingPrimary && <label className="field">
              <span className="label">職種</span>
              <input className="input" value={newPrimaryRoles} onChange={(event) => setNewPrimaryRoles(event.target.value)} placeholder="例: 多能工、配管工"/>
            </label>}
            <label className="field">
              <span className="label">二次会社（複数入力可・1行に1社）</span>
              <textarea className="textarea min-h-28" value={newSecondaryCompanies} onChange={(event) => setNewSecondaryCompanies(event.target.value)} placeholder={"例:\n山田配管工業\n鈴木電設\n佐藤工業"}/>
            </label>
            <button className="btn btn-primary md:mt-6" type="button" onClick={() => void addCompanyMaster()} disabled={companyLoading}>
              <Plus size={17} aria-hidden="true"/>
              まとめて追加
            </button>
          </div>

          <div className="hidden items-center justify-between gap-3 sm:flex">
            <p className="text-sm text-slate-600">
              つまみをドラッグして並び替え、最後に一度だけ保存してください。二次会社は同じ一次会社内で移動できます。
            </p>
            <button className="btn btn-primary shrink-0" type="button" disabled={companyLoading || !companyOrderDirty} onClick={() => void saveCompanyOrder()}>
              {companyLoading ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true"/> : null}
              並び順を保存
            </button>
          </div>

          <div className="grid gap-2">
            {companyFetching && <LoadingIndicator label="協力会社一覧を読み込み中…"/>}
            {!companyFetching && companyGroups.length === 0 && (<p className="py-6 text-center text-slate-500">
                協力会社がまだ登録されていません
              </p>)}
            {companyGroups.map((group) => (<div key={group.primaryCompany} className={`grid grid-cols-1 items-start gap-1 rounded-md sm:grid-cols-[auto_minmax(0,1fr)] ${dropTarget === group.primaryCompany ? "ring-2 ring-emerald-500 bg-emerald-50" : ""}`} onDragOver={(event) => {
                if (!draggedCompany || draggedCompany.rowId || companyLoading || editingCompanyId)
                    return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropTarget(group.primaryCompany);
            }} onDrop={(event) => {
                if (!draggedCompany || draggedCompany.rowId)
                    return;
                event.preventDefault();
                void dropCompany(group.primaryCompany);
            }}>
                <div className="hidden h-10 items-center gap-1 sm:flex">
                  <span className="inline-flex h-9 w-5 items-center justify-center cursor-grab text-slate-400 active:cursor-grabbing" draggable={!companyLoading && !editingCompanyId} title="ドラッグして一次会社を並び替え" onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", group.primaryCompany);
                event.dataTransfer.effectAllowed = "move";
                setDraggedCompany({ primary: group.primaryCompany });
            }} onDragEnd={clearCompanyDrag}><GripVertical size={18} aria-hidden="true"/></span>
                </div>
              <details className="min-w-0 flex-1 rounded-md border border-border bg-white">
                <summary className="flex min-h-10 cursor-pointer items-center rounded-md px-2.5 py-1.5 font-semibold text-slate-900 marker:text-emerald-700">
                  <span className="min-w-0 flex-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <CopyValue value={group.primaryCompany} label="一次会社" stopPropagation/>
                    {group.primaryTradeRoles.length > 0 && (<span className="text-sm font-normal text-slate-500">
                        <CopyValue value={group.primaryTradeRoles.join("・")} label="職種" stopPropagation/>
                      </span>)}
                    <span className="text-sm font-normal text-slate-500">
                      二次：{group.rows.filter((row) => row.secondary_company).length}社
                    </span>
                    <span className="ml-auto flex items-center gap-1">
                      <button type="button" className="btn btn-secondary h-8 w-8 p-0" disabled={companyLoading || !!editingPrimaryRoles} aria-label={`${group.primaryCompany}の会社名と職種を編集`} title="一次会社名と職種を編集" onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setEditingPrimaryRoles(group.primaryCompany);
                setEditPrimaryName(group.primaryCompany);
                setEditPrimaryRoles(group.primaryTradeRoles.join("、"));
                setMessage("");
                event.currentTarget.closest("details")?.setAttribute("open", "");
            }}>
                        <Pencil size={16} aria-hidden="true"/>
                      </button>
                      <button type="button" className="btn btn-secondary h-8 w-8 p-0" aria-label={`${group.primaryCompany}に追加`} title="この一次会社に追加" onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setNewPrimaryCompany(group.primaryCompany);
                setNewSecondaryCompanies("");
                setNewPrimaryRoles("");
                document.getElementById("add-company-primary")?.focus();
            }}>
                        <Plus size={17} aria-hidden="true"/>
                      </button>
                      <button type="button" className="btn btn-secondary h-8 w-8 p-0 text-red-700" disabled={companyLoading || !!editingCompanyId} aria-label={`${group.primaryCompany}と配下の二次会社を削除`} title="一次会社ごと削除" onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void removeCompanyMaster("", group);
            }}>
                        <Trash2 size={17} aria-hidden="true"/>
                      </button>
                    </span>
                  </span>
                </summary>
                <div className="grid gap-2 border-t border-border p-2 sm:p-3">
                  {editingPrimaryRoles === group.primaryCompany && (<div className="grid items-end gap-2 rounded-md bg-slate-50 p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                        <label className="field min-w-0">
                          <span className="label">一次会社名</span>
                          <input className="input" value={editPrimaryName} onChange={(event) => setEditPrimaryName(event.target.value)}/>
                        </label>
                        <label className="field min-w-0">
                          <span className="label">職種</span>
                          <input className="input" value={editPrimaryRoles} onChange={(event) => setEditPrimaryRoles(event.target.value)} placeholder="例：多能工、設備工" aria-label={`${group.primaryCompany}の職種を編集`}/>
                        </label>
                        <button type="button" className="btn btn-primary" disabled={companyLoading} onClick={() => void savePrimaryTradeRoles()}>
                          保存
                        </button>
                        <button type="button" className="btn btn-secondary" disabled={companyLoading} onClick={() => setEditingPrimaryRoles(null)}>
                          キャンセル
                        </button>
                    </div>)}
                  {group.rows.map((row) => (<div key={row.id} className={`grid items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 sm:grid-cols-[minmax(0,1fr)_auto] ${dropTarget === row.id ? "ring-2 ring-emerald-500" : ""}`} onDragOver={(event) => {
                    if (!draggedCompany?.rowId || draggedCompany.primary !== group.primaryCompany || companyLoading || editingCompanyId)
                        return;
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = "move";
                    setDropTarget(row.id);
                }} onDrop={(event) => {
                    if (!draggedCompany?.rowId)
                        return;
                    event.preventDefault();
                    event.stopPropagation();
                    void dropCompany(group.primaryCompany, row.id);
                }}>
                      {editingCompanyId === row.id ? (<div className="grid gap-2">
                          <label className="field">
                            <span className="label">二次会社</span>
                            <input className="input" value={editSecondaryCompany} onChange={(event) => setEditSecondaryCompany(event.target.value)} aria-label="二次会社を編集"/>
                          </label>
                        </div>) : (<div className="min-w-0">
                          <p className="break-words font-semibold">
                            {row.secondary_company || "一次会社のみ"}
                          </p>
                        </div>)}
                      <div className="flex flex-wrap items-center gap-2">
                        {group.rows.length > 1 ? (<div className="hidden items-center gap-2 sm:flex">
                            <span className="inline-flex h-9 w-5 items-center justify-center cursor-grab text-slate-400 active:cursor-grabbing" draggable={!companyLoading && !editingCompanyId} title="ドラッグして二次会社を並び替え" onDragStart={(event) => {
                        event.stopPropagation();
                        event.dataTransfer.setData("text/plain", row.id);
                        event.dataTransfer.effectAllowed = "move";
                        setDraggedCompany({ primary: group.primaryCompany, rowId: row.id });
                    }} onDragEnd={clearCompanyDrag}><GripVertical size={18} aria-hidden="true"/></span>
                          </div>) : null}
                        {editingCompanyId === row.id ? (<>
                            <button type="button" className="btn btn-primary" disabled={companyLoading} onClick={() => void saveCompanyMaster()}>
                              保存
                            </button>
                            <button type="button" className="btn btn-secondary" onClick={() => setEditingCompanyId(null)}>
                              キャンセル
                            </button>
                          </>) : (<>
                            <button type="button" className="btn btn-secondary h-8 w-8 p-0" disabled={companyLoading} onClick={() => startEditingCompany(row)} aria-label={`${row.secondary_company || row.primary_company}を編集`} title="二次会社名を編集">
                              <Pencil size={16} aria-hidden="true"/>
                            </button>
                            <button type="button" className="btn btn-secondary h-8 w-8 p-0 text-red-700" disabled={companyLoading} onClick={() => void removeCompanyMaster(row.id)} aria-label={`${row.secondary_company || row.primary_company}を削除`} title="削除">
                              <Trash2 size={16} aria-hidden="true"/>
                            </button>
                          </>)}
                      </div>
                    </div>))}
                </div>
              </details>
              </div>))}
          </div>
        </section>{confirmationDialog}</>;
}
function parseRoleText(value: string) {
    return [
        ...new Set(value
            .split(/\r?\n|,|、/)
            .map((role) => role.trim())
            .filter(Boolean)),
    ];
}
