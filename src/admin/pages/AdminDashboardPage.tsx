import {
  Building2,
  BarChart3,
  FileCheck2,
  Files,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from "lucide-react"
import { useEffect, useState } from "react"
import ApprovalsPage from "./ApprovalsPage"
import AllDocumentsPage from "./AllDocumentsPage"
import OfficesPage from "./OfficesPage"
import ReportsPage from "./ReportsPage"
import SettingsPage from "./SettingsPage"
import API_URL, { apiFetch } from "../../lib/apiFetch"

type OfficeSummary = {
  name: string
  inTransit: number
  onProcess: number
  ongoing: number
  accomplished: number
  discontinued: number
  exceeded: number
}

type DashboardStats = {
  ongoing: number
  accomplished: number
  discontinued: number
  exceeded: number
  officeSummary: OfficeSummary[]
}

type AdminDashboardPageProps = {
  onLogout: () => void
}

type SystemAdminRoute =
  | "dashboard"
  | "approvals"
  | "all-documents"
  | "offices"
  | "reports"
  | "settings"

export default function AdminDashboardPage({ onLogout }: AdminDashboardPageProps) {
  const [route, setRoute] = useState<SystemAdminRoute>("dashboard")
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [showTable, setShowTable] = useState(false)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await apiFetch(`${API_URL}/documents/stats`)
        if (res.ok) {
          const data = await res.json()
          setStats(data)
        }
      } catch (err) {
        console.error("Failed to fetch stats:", err)
      } finally {
        setStatsLoading(false)
      }
    }
    fetchStats()
  }, [])

  const mobileRouteLabel =
    route === "dashboard"
      ? "Dashboard"
      : route === "approvals"
        ? "Approvals"
        : route === "all-documents"
          ? "All Documents"
          : route === "offices"
            ? "Offices"
            : route === "reports"
              ? "Reports"
              : "Settings"

  function navClass(isActive: boolean) {
    return isActive
      ? "group flex w-full items-center gap-3 rounded-r-lg border-l-[3px] border-l-blue-600 bg-blue-50/90 px-3.5 py-2.5 text-sm font-semibold text-blue-700 shadow-xs transition-all duration-150 focus:outline-none"
      : "group flex w-full items-center gap-3 rounded-r-lg border-l-[3px] border-l-transparent px-3.5 py-2.5 text-sm font-medium text-slate-600 transition-all duration-150 hover:border-l-blue-400 hover:bg-blue-50/40 hover:text-blue-700 focus:outline-none"
  }

  function navButtonClass(isActive: boolean) {
    const base = navClass(isActive)
    return isSidebarCollapsed ? `${base} justify-center px-2 rounded-lg border-l-0` : base
  }

  return (
    <div className="min-h-dvh bg-slate-50/70 font-sans">
      <div
        className={`grid min-h-dvh grid-cols-1 ${isSidebarCollapsed ? "lg:grid-cols-[80px_1fr]" : "lg:grid-cols-[260px_1fr]"
          }`}
      >
        <aside className="hidden border-r border-slate-200/80 bg-white lg:block shadow-xs">
          <div className="flex h-dvh flex-col">
            <div
              className={`flex h-20 items-center gap-3 border-b border-slate-100 bg-linear-to-b from-slate-50/50 to-white ${isSidebarCollapsed ? "justify-center px-3" : "px-5"
                }`}
            >
              <div
                className={`grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5 ${isSidebarCollapsed ? "mx-auto" : ""
                  }`}
              >
                <img
                  src="/images/Bataan.png"
                  alt="Bataan"
                  className="size-full object-contain p-1.5 drop-shadow-xs"
                />
              </div>
              {isSidebarCollapsed ? null : (
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">The Bunker</div>
                  <div className="truncate text-sm font-bold tracking-tight text-slate-900">Bataan Capitol DTS</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="inline-block size-1.5 rounded-full bg-blue-600 animate-pulse" />
                    <span className="inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 ring-1 ring-blue-700/10">
                      System Admin
                    </span>
                  </div>
                </div>
              )}
            </div>

            <nav className="flex-1 space-y-1.5 p-3">
              <div className={isSidebarCollapsed ? "hidden" : "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400"}>
                Navigation
              </div>
              <button
                className={navButtonClass(route === "dashboard")}
                type="button"
                onClick={() => setRoute("dashboard")}
                title="Dashboard"
              >
                <LayoutDashboard className={`size-4 transition-colors ${route === "dashboard" ? "text-blue-600" : "text-slate-400 group-hover:text-blue-600"}`} />
                {isSidebarCollapsed ? null : "Dashboard"}
              </button>
              <button
                className={navButtonClass(route === "approvals")}
                type="button"
                onClick={() => setRoute("approvals")}
                title="Approvals"
              >
                <FileCheck2 className={`size-4 transition-colors ${route === "approvals" ? "text-blue-600" : "text-slate-400 group-hover:text-blue-600"}`} />
                {isSidebarCollapsed ? null : "Approvals"}
              </button>
              <button
                className={navButtonClass(route === "all-documents")}
                type="button"
                onClick={() => setRoute("all-documents")}
                title="All Documents"
              >
                <Files className={`size-4 transition-colors ${route === "all-documents" ? "text-blue-600" : "text-slate-400 group-hover:text-blue-600"}`} />
                {isSidebarCollapsed ? null : "All Documents"}
              </button>
              <button
                className={navButtonClass(route === "offices")}
                type="button"
                onClick={() => setRoute("offices")}
                title="Offices"
              >
                <Building2 className={`size-4 transition-colors ${route === "offices" ? "text-blue-600" : "text-slate-400 group-hover:text-blue-600"}`} />
                {isSidebarCollapsed ? null : "Offices"}
              </button>
              <button
                className={navButtonClass(route === "reports")}
                type="button"
                onClick={() => setRoute("reports")}
                title="Reports"
              >
                <BarChart3 className={`size-4 transition-colors ${route === "reports" ? "text-blue-600" : "text-slate-400 group-hover:text-blue-600"}`} />
                {isSidebarCollapsed ? null : "Reports"}
              </button>
              <button
                className={navButtonClass(route === "settings")}
                type="button"
                onClick={() => setRoute("settings")}
                title="Settings"
              >
                <Settings className={`size-4 transition-colors ${route === "settings" ? "text-blue-600" : "text-slate-400 group-hover:text-blue-600"}`} />
                {isSidebarCollapsed ? null : "Settings"}
              </button>
            </nav>

            <div className="border-t border-slate-100 bg-slate-50/50 p-3 space-y-2">
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed((v) => !v)}
                className={`inline-flex h-9 w-full items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200/80 bg-white py-2 text-xs font-semibold text-slate-600 shadow-xs transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none ${isSidebarCollapsed ? "justify-center px-2" : "justify-start px-3.5"
                  }`}
                title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isSidebarCollapsed ? <PanelLeftOpen className="size-4 text-slate-500" /> : <PanelLeftClose className="size-4 text-slate-500" />}
                {isSidebarCollapsed ? null : "Collapse sidebar"}
              </button>

              <button
                className={`inline-flex h-9 w-full items-center gap-2 whitespace-nowrap rounded-lg border border-rose-200/60 bg-white py-2 text-xs font-semibold text-rose-600 shadow-xs transition-colors hover:bg-rose-50 hover:border-rose-300 focus:outline-none ${isSidebarCollapsed ? "justify-center px-2" : "justify-start px-3.5"
                  }`}
                onClick={onLogout}
                type="button"
                title="Logout"
              >
                <LogOut className="size-4 text-rose-500" />
                {isSidebarCollapsed ? null : "Logout"}
              </button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 h-dvh overflow-y-auto">
          <div className="lg:hidden">
            <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/95 backdrop-blur shadow-xs">
              <div className="flex h-16 w-full items-center justify-between gap-4 px-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white shadow-xs ring-1 ring-slate-900/5">
                    <img src="/images/Bataan.png" alt="Bataan" className="size-full object-contain p-1 drop-shadow-xs" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-blue-600">The Bunker</div>
                    <div className="truncate text-sm font-bold text-slate-900">Bataan Capitol DTS</div>
                    <div className="truncate text-[11px] font-medium text-slate-500">{mobileRouteLabel}</div>
                  </div>
                </div>
                <button
                  className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-200 bg-rose-50/50 px-3 text-xs font-semibold text-rose-600 shadow-xs transition hover:bg-rose-100"
                  onClick={onLogout}
                  type="button"
                >
                  <LogOut className="size-3.5" />
                  Logout
                </button>
              </div>
            </header>

            <nav className="border-b border-slate-200/80 bg-white px-3 py-2 shadow-xs">
              <div className="flex gap-1.5 overflow-x-auto">
                <button
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${route === "dashboard"
                    ? "border-l-[3px] border-l-blue-600 bg-blue-50 text-blue-700 shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  onClick={() => setRoute("dashboard")}
                  type="button"
                >
                  <LayoutDashboard className="size-3.5" />
                  Dashboard
                </button>
                <button
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${route === "approvals"
                    ? "border-l-[3px] border-l-blue-600 bg-blue-50 text-blue-700 shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  onClick={() => setRoute("approvals")}
                  type="button"
                >
                  <FileCheck2 className="size-3.5" />
                  Approvals
                </button>
                <button
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${route === "all-documents"
                    ? "border-l-[3px] border-l-blue-600 bg-blue-50 text-blue-700 shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  onClick={() => setRoute("all-documents")}
                  type="button"
                >
                  <Files className="size-3.5" />
                  Documents
                </button>
                <button
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${route === "offices"
                    ? "border-l-[3px] border-l-blue-600 bg-blue-50 text-blue-700 shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  onClick={() => setRoute("offices")}
                  type="button"
                >
                  <Building2 className="size-3.5" />
                  Offices
                </button>
                <button
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${route === "reports"
                    ? "border-l-[3px] border-l-blue-600 bg-blue-50 text-blue-700 shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  onClick={() => setRoute("reports")}
                  type="button"
                >
                  <BarChart3 className="size-3.5" />
                  Reports
                </button>
                <button
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${route === "settings"
                    ? "border-l-[3px] border-l-blue-600 bg-blue-50 text-blue-700 shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  onClick={() => setRoute("settings")}
                  type="button"
                >
                  <Settings className="size-3.5" />
                  Settings
                </button>
              </div>
            </nav>
          </div>

          {route === "dashboard" ? (
            <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/95 backdrop-blur shadow-xs">
              <div className="flex h-16 w-full items-center justify-between gap-4 px-4 lg:px-8">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Overview</div>
                  <div className="truncate text-xl font-bold tracking-tight text-slate-900">System Dashboard</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-200 bg-rose-50/50 px-3 text-xs font-semibold text-rose-600 shadow-xs transition hover:bg-rose-100 lg:hidden"
                    onClick={onLogout}
                    type="button"
                  >
                    <LogOut className="size-3.5" />
                    Logout
                  </button>
                </div>
              </div>
            </header>
          ) : null}

          {route === "approvals" ? (
            <div className="w-full px-4 py-6 lg:px-8">
              <ApprovalsPage />
            </div>
          ) : route === "offices" ? (
            <div className="w-full px-4 py-6 lg:px-8">
              <OfficesPage />
            </div>
          ) : route === "reports" ? (
            <div className="w-full px-4 py-6 lg:px-8">
              <ReportsPage />
            </div>
          ) : route === "all-documents" ? (
            <div className="w-full px-4 py-6 lg:px-8">
              <AllDocumentsPage />
            </div>
          ) : route === "settings" ? (
            <div className="w-full px-4 py-6 lg:px-8">
              <SettingsPage />
            </div>
          ) : (
            <div className="w-full space-y-6 px-4 py-6 lg:px-8">
              <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {/* Ongoing */}
                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 border-t-4 border-t-blue-600 bg-white p-5 shadow-xs transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-600">Ongoing</span>
                    <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Files className="size-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-3xl font-extrabold tracking-tight text-slate-900">
                      {statsLoading ? "..." : stats?.ongoing.toLocaleString() ?? "0"}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                      <span className="inline-block size-1.5 rounded-full bg-blue-500 animate-ping" />
                      In progress / active routing
                    </div>
                  </div>
                </div>

                {/* Completed */}
                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 border-t-4 border-t-emerald-600 bg-white p-5 shadow-xs transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Completed</span>
                    <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                      <FileCheck2 className="size-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-3xl font-extrabold tracking-tight text-slate-900">
                      {statsLoading ? "..." : stats?.accomplished.toLocaleString() ?? "0"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 font-medium">
                      Completed documents
                    </div>
                  </div>
                </div>

                {/* Discontinued */}
                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 border-t-4 border-t-rose-600 bg-white p-5 shadow-xs transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-rose-600">Discontinued</span>
                    <div className="flex size-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                      <LogOut className="size-4 rotate-180" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-3xl font-extrabold tracking-tight text-slate-900">
                      {statsLoading ? "..." : stats?.discontinued.toLocaleString() ?? "0"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 font-medium">
                      Closed / canceled requests
                    </div>
                  </div>
                </div>

                {/* Exceeded */}
                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 border-t-4 border-t-amber-500 bg-white p-5 shadow-xs transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-600">Exceeded</span>
                    <div className="flex size-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                      <BarChart3 className="size-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-3xl font-extrabold tracking-tight text-slate-900">
                      {statsLoading ? "..." : stats?.exceeded?.toLocaleString() ?? "0"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 font-medium">
                      Overdue task durations
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <div className="rounded-2xl border border-slate-200/80 bg-white text-slate-900 shadow-xs overflow-hidden">
                  <div className="flex items-center justify-between gap-4 p-6 border-b border-slate-100 bg-slate-50/40">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-blue-600">Breakdown</div>
                      <div className="text-base font-bold tracking-tight text-slate-900">Document Summary</div>
                      <div className="text-xs text-slate-500 font-medium mt-0.5">Real-time status overview per office</div>
                    </div>
                    <button
                      className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-xs transition-all hover:bg-slate-50 hover:border-slate-300 focus:outline-none"
                      type="button"
                      onClick={() => setShowTable(!showTable)}
                    >
                      {showTable ? "Collapse Table" : "View Breakdown Table"}
                    </button>
                  </div>

                  {showTable && (
                    <div className="p-6 pt-4">
                      <div className="relative w-full overflow-auto rounded-xl border border-slate-200/80">
                        <table className="w-full caption-bottom text-sm border-collapse border border-slate-200 [&_th]:border [&_th]:border-blue-700 [&_td]:border [&_td]:border-slate-200">
                          <thead className="bg-blue-600 text-white border-b border-blue-700">
                            <tr>
                              <th className="h-10 px-4 text-left align-middle text-xs font-bold uppercase tracking-wider text-white">
                                Office
                              </th>
                              <th className="h-10 px-4 text-left align-middle text-xs font-bold uppercase tracking-wider text-white">
                                Ongoing
                              </th>
                              <th className="h-10 px-4 text-left align-middle text-xs font-bold uppercase tracking-wider text-white">
                                Completed
                              </th>
                              <th className="h-10 px-4 text-left align-middle text-xs font-bold uppercase tracking-wider text-white">
                                Discontinued
                              </th>
                              <th className="h-10 px-4 text-left align-middle text-xs font-bold uppercase tracking-wider text-white">
                                Exceeded
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {statsLoading ? (
                              <tr>
                                <td className="px-3 py-10 text-center text-sm text-slate-600" colSpan={5}>
                                  Loading...
                                </td>
                              </tr>
                            ) : stats?.officeSummary && stats.officeSummary.length > 0 ? (
                              stats.officeSummary.map((office) => (
                                <tr key={office.name} className="border-b border-slate-200 transition-colors hover:bg-slate-50">
                                  <td className="px-4 py-3 align-middle font-medium text-slate-900">{office.name}</td>
                                  <td className="px-4 py-3 align-middle text-sky-700 font-medium">
                                    {office.ongoing}
                                  </td>
                                  <td className="px-4 py-3 align-middle text-emerald-700 font-medium">
                                    {office.accomplished}
                                  </td>
                                  <td className="px-4 py-3 align-middle text-rose-700 font-medium">
                                    {office.discontinued}
                                  </td>
                                  <td className="px-4 py-3 align-middle text-amber-700 font-medium">
                                    {office.exceeded}
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td className="px-3 py-10 text-center text-sm text-slate-600" colSpan={5}>
                                  No data available
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
