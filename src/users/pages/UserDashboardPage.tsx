import { FileStack, Files, FolderSearch, LogOut, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react"
import { useEffect, useState } from "react"
import UserDocuments from "./UserDocuments"
import UserProfile from "./UserProfile"
import AllDocumentsPage from "../../admin/pages/AllDocumentsPage"
import API_URL from "../../lib/api"

type UserDashboardPageProps = {
  onLogout: () => void
  user?: {
    username: string
    role: string
    fullName?: string
    office?: string
  }
}

type UserRoute = "documents" | "all-documents" | "profile"

export default function UserDashboardPage({ onLogout, user }: UserDashboardPageProps) {
  const [route, setRoute] = useState<UserRoute>("documents")
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [officePrivileges, setOfficePrivileges] = useState<string[]>([])

  const hasPrivilege = (name: string) => {
    const needle = String(name || "").trim().toLowerCase()
    if (!needle) return false
    return officePrivileges.some((p) => String(p || "").trim().toLowerCase() === needle)
  }



  useEffect(() => {
    if (!user?.office) {
      setOfficePrivileges([])
      return
    }

    ;(async () => {
      try {
        const token = localStorage.getItem("token")
        const response = await fetch(`${API_URL}/offices`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) return
        const data = (await response.json()) as {
          offices?: Array<{ name?: string; privileges?: string[] }>
        }
        const offices = Array.isArray(data?.offices) ? data.offices : []

        const currentName = String(user.office || "").trim().toLowerCase()
        const matched = offices.find((o) => String(o?.name || "").trim().toLowerCase() === currentName)
        if (matched && Array.isArray(matched.privileges)) {
          setOfficePrivileges(matched.privileges.map((p) => String(p)))
        } else {
          setOfficePrivileges([])
        }
      } catch {
        setOfficePrivileges([])
      }
    })()
  }, [user?.office])




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
        {/* Sidebar */}
        <aside className="hidden border-r border-slate-200/80 bg-white lg:block shadow-xs">
          <div className="flex h-dvh flex-col">
            {/* Logo Header */}
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
                    <span className="inline-block size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="truncate text-[11px] font-medium text-slate-500">{user?.fullName || user?.office || "End User"}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1.5 p-3">
              <div className={isSidebarCollapsed ? "hidden" : "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400"}>
                Menu
              </div>
              <button
                className={navButtonClass(route === "documents")}
                type="button"
                onClick={() => setRoute("documents")}
                title="Office Requests"
              >
                <FileStack className={`size-4 transition-colors ${route === "documents" ? "text-blue-600" : "text-slate-400 group-hover:text-blue-600"}`} />
                {isSidebarCollapsed ? null : "Office Requests"}
              </button>
              <button
                className={navButtonClass(route === "all-documents")}
                type="button"
                onClick={() => setRoute("all-documents")}
                title="All Documents"
              >
                <FolderSearch className={`size-4 transition-colors ${route === "all-documents" ? "text-blue-600" : "text-slate-400 group-hover:text-blue-600"}`} />
                {isSidebarCollapsed ? null : "All Documents"}
              </button>

              <button
                className={navButtonClass(route === "profile")}
                type="button"
                onClick={() => setRoute("profile")}
                title="Account Settings"
              >
                <Settings className={`size-4 transition-colors ${route === "profile" ? "text-blue-600" : "text-slate-400 group-hover:text-blue-600"}`} />
                {isSidebarCollapsed ? null : "Account Settings"}
              </button>
            </nav>

            {/* Footer Actions */}
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

        {/* Mobile Header */}
        <div className="lg:hidden">
          <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/95 backdrop-blur shadow-xs">
            <div className="flex h-16 w-full items-center justify-between gap-4 px-4">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center overflow-hidden rounded-xl bg-white shadow-xs ring-1 ring-slate-900/5">
                  <img
                    src="/images/Bataan.png"
                    alt="Bataan"
                    className="size-full object-contain p-1 drop-shadow-xs"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-blue-600">The Bunker</div>
                  <div className="truncate text-sm font-bold text-slate-900">Bataan Capitol DTS</div>
                  <div className="truncate text-[11px] font-medium text-slate-500">{user?.fullName || "User Portal"}</div>
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

          {/* Mobile Navigation */}
          <nav className="border-b border-slate-200/80 bg-white px-3 py-2 shadow-xs">
            <div className="flex gap-1.5 overflow-x-auto">
              <button
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${route === "documents"
                  ? "border-l-[3px] border-l-blue-600 bg-blue-50 text-blue-700 shadow-xs"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                onClick={() => setRoute("documents")}
                type="button"
              >
                <FileStack className="size-3.5" />
                Office Requests
              </button>
              <button
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${route === "all-documents"
                  ? "border-l-[3px] border-l-blue-600 bg-blue-50 text-blue-700 shadow-xs"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                onClick={() => setRoute("all-documents")}
              >
                <FolderSearch className="size-3.5" />
                All Documents
              </button>

              <button
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${route === "profile"
                  ? "border-l-[3px] border-l-blue-600 bg-blue-50 text-blue-700 shadow-xs"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                onClick={() => setRoute("profile")}
              >
                <Settings className="size-3.5" />
                Account Settings
              </button>
            </div>
          </nav>
        </div>

        {/* Main Content */}
        <main className="min-w-0 h-dvh overflow-y-auto">
          {route === "documents" ? (
            <UserDocuments />
          ) : route === "all-documents" ? (
            <div className="w-full px-4 py-6 lg:px-8">
              <AllDocumentsPage title="All Documents" readOnly />
            </div>
          ) : route === "profile" ? (
            <UserProfile user={user} />
          ) : (
            <UserDocuments />
          )}
        </main>
      </div>
    </div>
  )
}