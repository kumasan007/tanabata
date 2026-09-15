"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";
import { AdminTabs, type AdminTab } from "@/components/admin/admin-tabs";
import { AdminLogin } from "@/components/admin/admin-login";
import { LoadingIndicator } from "@/components/loading-indicator";
import { apiFetch } from "@/lib/api-client";
const loading = () => <LoadingIndicator label="管理画面を読み込み中…"/>;
const CompaniesPanel = dynamic(() => import("@/components/admin/companies-panel").then(m => m.CompaniesPanel), { loading });
const RecoveryPanel = dynamic(() => import("@/components/admin/recovery-panel").then(m => m.RecoveryPanel), { loading });
export function AdminDashboard() {
    const [password, setPassword] = useState("");
    const [authenticated, setAuthenticated] = useState(false);
    const [checkingSession, setCheckingSession] = useState(true);
    const [loginLoading, setLoginLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<AdminTab>("companies");
    const [message, setMessage] = useState("");
    const [companyVersion, setCompanyVersion] = useState(0);
    useEffect(() => { apiFetch("/api/admin/session").then(r => r.json()).then(body => setAuthenticated(Boolean(body.authenticated))).catch(() => setAuthenticated(false)).finally(() => setCheckingSession(false)); }, []);
    async function login(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setMessage("");
        setLoginLoading(true);
        try {
            const response = await apiFetch("/api/admin/login", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ password }),
            });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error ?? "ログインに失敗しました。");
            setPassword("");
            setAuthenticated(true);
        }
        catch (error) {
            setMessage(error instanceof Error
                ? error.message
                : "接続できませんでした。もう一度お試しください。");
        }
        finally {
            setLoginLoading(false);
        }
    }
    async function logout() {
        await apiFetch("/api/admin/logout", { method: "POST" });
        setAuthenticated(false);
        window.location.href = "/";
    }
    if (checkingSession)
        return <main className="admin-dashboard mx-auto grid min-h-screen max-w-xl place-items-center px-4"><div className="flex items-center gap-3 text-sm text-slate-500" role="status"><LoaderCircle size={20} className="animate-spin text-emerald-700" aria-hidden="true"/>管理画面を準備しています</div></main>;
    if (!authenticated)
        return <AdminLogin password={password} loading={loginLoading} message={message} onPasswordChange={setPassword} onSubmit={login}/>;
    return <main className="admin-dashboard min-h-screen bg-[#f6f7f5]"><div className="mx-auto grid max-w-6xl gap-3 px-4 py-3 sm:px-6 sm:py-4"><div className="flex justify-end"><button className="btn btn-secondary px-3" type="button" onClick={logout}><LogOut size={17} aria-hidden="true"/>ログアウト</button></div><AdminTabs active={activeTab} onChange={setActiveTab}/><div hidden={activeTab !== "companies"}><CompaniesPanel refreshVersion={companyVersion}/></div>{activeTab !== "companies" && <RecoveryPanel key={activeTab} kind={activeTab} onRestored={() => setCompanyVersion(v => v + 1)}/>}</div></main>;
}
