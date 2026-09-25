"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { AdminTabs, type AdminTab } from "@/components/admin/admin-tabs";
import { AdminLogin } from "@/components/admin/admin-login";
import { LoadingIndicator } from "@/components/loading-indicator";
import { apiFetch } from "@/lib/api-client";
import { notifySessionChanged, useEmployeeSession } from "@/lib/employee-session";
const loading = () => <LoadingIndicator label="管理画面を読み込み中…"/>;
const CompaniesPanel = dynamic(() => import("@/components/admin/companies-panel").then(m => m.CompaniesPanel), { loading });
const EquipmentFloorsPanel = dynamic(() => import("@/components/admin/equipment-floors-panel").then(m => m.EquipmentFloorsPanel), { loading });
const EquipmentVehiclesPanel = dynamic(() => import("@/components/admin/equipment-vehicles-panel").then(m => m.EquipmentVehiclesPanel), { loading });
const TachiumaUnitsPanel = dynamic(() => import("@/components/admin/tachiuma-units-panel").then(m => m.TachiumaUnitsPanel), { loading });
const RecoveryPanel = dynamic(() => import("@/components/admin/recovery-panel").then(m => m.RecoveryPanel), { loading });
export function AdminDashboard({ initialAuthenticated }: { initialAuthenticated: boolean }) {
    const [password, setPassword] = useState("");
    const authenticated = useEmployeeSession(initialAuthenticated);
    const [loginLoading, setLoginLoading] = useState(false);
    const [logoutLoading, setLogoutLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<AdminTab>("companies");
    const [message, setMessage] = useState("");
    const [companyVersion, setCompanyVersion] = useState(0);
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
            notifySessionChanged(true);
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
        if (logoutLoading) return;
        setLogoutLoading(true); setMessage("");
        try {
            const response = await apiFetch("/api/admin/logout", { method: "POST" });
            if (!response.ok) throw new Error("ログアウトできませんでした。もう一度お試しください。");
            notifySessionChanged(false);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "接続できませんでした。もう一度お試しください。");
        } finally { setLogoutLoading(false); }
    }
    if (!authenticated)
        return <AdminLogin password={password} loading={loginLoading} message={message} onPasswordChange={setPassword} onSubmit={login}/>;
    return <main className="admin-dashboard min-h-screen bg-[#f6f7f5]"><div className="mx-auto grid max-w-6xl gap-3 px-4 py-3 sm:px-6 sm:py-4"><div className="flex justify-end"><button className="btn btn-secondary px-3" type="button" disabled={logoutLoading} onClick={() => void logout()}><LogOut size={17} aria-hidden="true"/>ログアウト</button></div>{message && <p role="alert" className="notice-error text-sm">{message}</p>}<AdminTabs active={activeTab} onChange={setActiveTab}/><div hidden={activeTab !== "companies"}><CompaniesPanel refreshVersion={companyVersion}/></div><div hidden={activeTab !== "floors"}>{activeTab === "floors" && <EquipmentFloorsPanel/>}</div><div hidden={activeTab !== "vehicles"}>{activeTab === "vehicles" && <EquipmentVehiclesPanel/>}</div><div hidden={activeTab !== "tachiumas"}>{activeTab === "tachiumas" && <TachiumaUnitsPanel/>}</div>{(activeTab === "backups" || activeTab === "auditLogs") && <RecoveryPanel kind={activeTab} active onRestored={() => setCompanyVersion(v => v + 1)}/>}</div></main>;
}
