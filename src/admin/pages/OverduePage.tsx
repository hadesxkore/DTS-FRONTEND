import {
  AlertTriangle,
  Bell,
  BellRing,
  Clock,
  RefreshCw,
  Search,
  X,
  FileText,
  Building2,
  ChevronUp,
  ChevronDown,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import API_URL, { apiFetch } from "../../lib/apiFetch"

type OverdueInfo = {
  currentOffice: string
  taskName: string
  taskDuration: string
  receivedAt: string
  overdueMs: number
  overdueDays: number
  overdueHours: number
  overdueLabel: string
}

type OverdueDocument = {
  _id: string
  trackingNo: string
  purpose: string
  office?: string
  status?: string
  createdBy?: string
  createdAt?: string
  amount?: string
  fund?: string
  _overdueInfo: OverdueInfo
}

type SortKey = "overdueMs" | "trackingNo" | "office" | "receivedAt"
type SortDir = "asc" | "desc"

function formatDate(dateStr?: string) {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function statusLabel(status?: string) {
  const s = String(status || "").toLowerCase()
  const map: Record<string, string> = {
    ongoing: "Ongoing",
    "in-budget": "In Budget",
    "in-pto": "In PTO",
    "pending-gso": "Pending GSO",
    "pending-bac": "Pending BAC",
    "ready-transfer": "Ready to Transfer",
    "for-validation": "For Validation",
    "pre-validation": "Pre-Validation",
    "for-revision": "For Revision",
    approved: "Approved",
    received: "Received",
  }
  return map[s] || (status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown")
}

function statusColor(status?: string) {
  const s = String(status || "").toLowerCase()
  if (s.includes("budget")) return "bg-indigo-50 text-indigo-700 ring-indigo-600/20"
  if (s.includes("pto")) return "bg-sky-50 text-sky-700 ring-sky-600/20"
  if (s.includes("gso")) return "bg-violet-50 text-violet-700 ring-violet-600/20"
  if (s.includes("bac")) return "bg-purple-50 text-purple-700 ring-purple-600/20"
  if (s.includes("approved")) return "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
  return "bg-amber-50 text-amber-700 ring-amber-600/20"
}

export default function OverduePage() {
  const [documents, setDocuments] = useState<OverdueDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [officeFilter, setOfficeFilter] = useState("all")
  const [sortKey, setSortKey] = useState<SortKey>("overdueMs")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [selected, setSelected] = useState<OverdueDocument | null>(null)

  // Notification state
  const [notifyTarget, setNotifyTarget] = useState<"all" | OverdueDocument | null>(null)
  const [notifying, setNotifying] = useState(false)
  const [notifyingId, setNotifyingId] = useState<string | null>(null)
  const [notifyResult, setNotifyResult] = useState<string | null>(null)

  const fetchOverdue = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch(`${API_URL}/documents/overdue`)
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const data = await res.json()
      setDocuments(Array.isArray(data.documents) ? data.documents : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overdue documents")
    } finally {
      setLoading(false)
    }
  }, [])

  const sendNotification = useCallback(async (ids?: string[]) => {
    setNotifying(true)
    setNotifyResult(null)
    try {
      const body = ids ? { documentIds: ids } : {}
      const res = await apiFetch(`${API_URL}/documents/notify-overdue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setNotifyResult(data.message || "Notifications sent!")
    } catch {
      setNotifyResult("Failed to send notifications. Please try again.")
    } finally {
      setNotifying(false)
      setNotifyingId(null)
      setNotifyTarget(null)
    }
  }, [])

  useEffect(() => {
    fetchOverdue()
  }, [fetchOverdue])

  const offices = Array.from(
    new Set(documents.map((d) => d._overdueInfo.currentOffice).filter(Boolean))
  ).sort()

  const filtered = documents.filter((doc) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      doc.trackingNo.toLowerCase().includes(q) ||
      doc.purpose.toLowerCase().includes(q) ||
      (doc.office || "").toLowerCase().includes(q) ||
      doc._overdueInfo.currentOffice.toLowerCase().includes(q) ||
      doc._overdueInfo.taskName.toLowerCase().includes(q)
    const matchOffice = officeFilter === "all" || doc._overdueInfo.currentOffice === officeFilter
    return matchSearch && matchOffice
  })

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortKey === "overdueMs") cmp = a._overdueInfo.overdueMs - b._overdueInfo.overdueMs
    else if (sortKey === "trackingNo") cmp = a.trackingNo.localeCompare(b.trackingNo)
    else if (sortKey === "office") cmp = a._overdueInfo.currentOffice.localeCompare(b._overdueInfo.currentOffice)
    else if (sortKey === "receivedAt") cmp = new Date(a._overdueInfo.receivedAt).getTime() - new Date(b._overdueInfo.receivedAt).getTime()
    return sortDir === "asc" ? cmp : -cmp
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir("desc") }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronDown className="size-3 text-white/40" />
    return sortDir === "asc" ? <ChevronUp className="size-3 text-white" /> : <ChevronDown className="size-3 text-white" />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1.5">
            <AlertTriangle className="size-3" /> Action Required
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 mt-0.5">Overdue Documents</h1>
          <p className="text-sm text-slate-500 mt-0.5">Documents that have exceeded their assigned task duration</p>
        </div>
        <div className="flex items-center gap-2">
          {documents.length > 0 && (
            <button
              type="button"
              onClick={() => setNotifyTarget("all")}
              disabled={notifying}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-700 shadow-xs transition hover:bg-amber-100 disabled:opacity-60"
            >
              <BellRing className={`size-3.5 ${notifying ? "animate-bounce" : ""}`} />
              Notify All
            </button>
          )}
          <button
            type="button"
            onClick={fetchOverdue}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {!loading && !error && notifyResult && (
        <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
          notifyResult.startsWith("Failed")
            ? "bg-rose-50 border-rose-200 text-rose-700"
            : "bg-emerald-50 border-emerald-200 text-emerald-700"
        }`}>
          <Bell className="size-4 shrink-0 mt-0.5" />
          <span>{notifyResult}</span>
          <button type="button" onClick={() => setNotifyResult(null)} className="ml-auto text-current opacity-60 hover:opacity-100">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {!loading && !error && (
        <div className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-amber-50 p-5 shadow-xs">
          <div className="absolute inset-y-0 left-0 w-1 rounded-l-2xl bg-amber-500" />
          <div className="flex flex-wrap items-center gap-6 pl-3">
            <div>
              <div className="text-3xl font-extrabold tracking-tight text-amber-700">{documents.length}</div>
              <div className="text-xs font-medium text-amber-600 mt-0.5">Total overdue document{documents.length !== 1 ? "s" : ""}</div>
            </div>
            <div className="h-10 w-px bg-amber-200" />
            <div>
              <div className="text-3xl font-extrabold tracking-tight text-amber-700">{offices.length}</div>
              <div className="text-xs font-medium text-amber-600 mt-0.5">Office{offices.length !== 1 ? "s" : ""} affected</div>
            </div>
            {documents.length > 0 && (
              <>
                <div className="h-10 w-px bg-amber-200" />
                <div>
                  <div className="text-sm font-semibold text-amber-700">Most Overdue</div>
                  <div className="text-xs text-amber-600 mt-0.5">{documents[0]._overdueInfo.overdueLabel} — <span className="font-medium">{documents[0].trackingNo}</span></div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search tracking no., purpose, office…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 shadow-xs outline-none placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20" />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <select value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-xs outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20">
          <option value="all">All Offices</option>
          {offices.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
            <RefreshCw className="size-7 animate-spin text-amber-400" />
            <span className="text-sm font-medium">Loading overdue documents…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <AlertTriangle className="size-8 text-rose-400" />
            <span className="text-sm font-medium text-rose-600">{error}</span>
            <button type="button" onClick={fetchOverdue}
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50">
              <RefreshCw className="size-3" /> Retry
            </button>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
            <div className="grid size-14 place-items-center rounded-2xl bg-emerald-50">
              <FileText className="size-7 text-emerald-400" />
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-slate-700">{search || officeFilter !== "all" ? "No results found" : "No overdue documents!"}</div>
              <div className="mt-1 text-xs text-slate-400">{search || officeFilter !== "all" ? "Try adjusting your search or filter." : "All documents are within their task durations."}</div>
            </div>
          </div>
        ) : (
          <div className="relative overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-amber-600 text-white">
                  <th className="h-10 px-4 text-left align-middle text-xs font-bold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort("trackingNo")}>
                    <span className="inline-flex items-center gap-1">Tracking No. <SortIcon k="trackingNo" /></span>
                  </th>
                  <th className="h-10 px-4 text-left align-middle text-xs font-bold uppercase tracking-wider">Purpose</th>
                  <th className="h-10 px-4 text-left align-middle text-xs font-bold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort("office")}>
                    <span className="inline-flex items-center gap-1">Current Office <SortIcon k="office" /></span>
                  </th>
                  <th className="h-10 px-4 text-left align-middle text-xs font-bold uppercase tracking-wider whitespace-nowrap">Task / Step</th>
                  <th className="h-10 px-4 text-left align-middle text-xs font-bold uppercase tracking-wider whitespace-nowrap">Allowed Duration</th>
                  <th className="h-10 px-4 text-left align-middle text-xs font-bold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort("receivedAt")}>
                    <span className="inline-flex items-center gap-1">Received At <SortIcon k="receivedAt" /></span>
                  </th>
                  <th className="h-10 px-4 text-left align-middle text-xs font-bold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort("overdueMs")}>
                    <span className="inline-flex items-center gap-1">Overdue By <SortIcon k="overdueMs" /></span>
                  </th>
                  <th className="h-10 px-4 text-left align-middle text-xs font-bold uppercase tracking-wider">Status</th>
                  <th className="h-10 px-4 text-left align-middle text-xs font-bold uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((doc) => (
                  <tr key={doc._id} className="group transition-colors hover:bg-amber-50/50">
                    <td className="px-4 py-3 align-middle font-mono text-xs font-bold text-slate-800 whitespace-nowrap">{doc.trackingNo}</td>
                    <td className="px-4 py-3 align-middle text-slate-700 max-w-[240px]">
                      <div className="line-clamp-2 text-xs">{doc.purpose}</div>
                    </td>
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <Building2 className="size-3 text-slate-400" />{doc._overdueInfo.currentOffice}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle text-xs text-slate-600 whitespace-nowrap max-w-[180px]">
                      <div className="truncate">{doc._overdueInfo.taskName || "—"}</div>
                    </td>
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                        <Clock className="size-3 text-slate-400" />{doc._overdueInfo.taskDuration}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle text-xs text-slate-500 whitespace-nowrap">{formatDate(doc._overdueInfo.receivedAt)}</td>
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 ring-1 ring-red-600/20">
                        <AlertTriangle className="size-3" />{doc._overdueInfo.overdueLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusColor(doc.status)}`}>
                        {statusLabel(doc.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => setSelected(doc)}
                          className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 shadow-xs transition hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700">
                          View
                        </button>
                        <button
                          type="button"
                          title="Notify office & requestor"
                          disabled={notifyingId === doc._id && notifying}
                          onClick={() => { setNotifyingId(doc._id); setNotifyTarget(doc) }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600 shadow-xs transition hover:bg-amber-100 hover:border-amber-400 disabled:opacity-60"
                        >
                          {notifyingId === doc._id && notifying
                            ? <RefreshCw className="size-3.5 animate-spin" />
                            : <Bell className="size-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && sorted.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            Showing {sorted.length} of {documents.length} overdue document{documents.length !== 1 ? "s" : ""}{(search || officeFilter !== "all") && " (filtered)"}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={() => setSelected(null)}>
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 border-b border-amber-700 bg-amber-600 px-6 py-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-200">Overdue Document</div>
                <div className="font-mono text-base font-bold text-white mt-0.5">{selected.trackingNo}</div>
              </div>
              <button type="button" onClick={() => setSelected(null)}
                className="grid size-8 place-items-center rounded-lg text-white/70 hover:bg-amber-700 hover:text-white transition">
                <X className="size-4" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[70vh] p-6 space-y-4">
              <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                <AlertTriangle className="size-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-red-700">{selected._overdueInfo.overdueLabel}</div>
                  <div className="text-xs text-red-500 mt-0.5">Task &quot;{selected._overdueInfo.taskName}&quot; at {selected._overdueInfo.currentOffice} exceeded the {selected._overdueInfo.taskDuration} limit</div>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2 rounded-lg bg-slate-50 px-3 py-2.5">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Purpose</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{selected.purpose}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Requestor Office</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{selected.office || "—"}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Office</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{selected._overdueInfo.currentOffice}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</dt>
                  <dd className="mt-0.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${statusColor(selected.status)}`}>{statusLabel(selected.status)}</span>
                  </dd>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Allowed Duration</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{selected._overdueInfo.taskDuration}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Received At</dt>
                  <dd className="mt-0.5 text-xs font-medium text-slate-700">{formatDate(selected._overdueInfo.receivedAt)}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Created By</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{selected.createdBy || "—"}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Created At</dt>
                  <dd className="mt-0.5 text-xs font-medium text-slate-700">{formatDate(selected.createdAt)}</dd>
                </div>
                {selected.amount && (
                  <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount</dt>
                    <dd className="mt-0.5 font-medium text-slate-800">{selected.amount}</dd>
                  </div>
                )}
                {selected.fund && (
                  <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fund</dt>
                    <dd className="mt-0.5 font-medium text-slate-800">{selected.fund}</dd>
                  </div>
                )}
              </dl>
            </div>
            <div className="border-t border-slate-100 px-6 py-4 flex justify-end">
              <button type="button" onClick={() => setSelected(null)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Notify Confirm Modal ─────────────────────────────────────── */}
      {notifyTarget !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
          onClick={() => { if (!notifying) { setNotifyTarget(null); setNotifyingId(null) } }}
        >
          <div
            className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-amber-700 bg-amber-600 px-6 py-4">
              <BellRing className="size-5 text-white" />
              <div className="font-bold text-white text-base">
                {notifyTarget === "all" ? "Notify All Overdue Documents" : `Notify — ${(notifyTarget as OverdueDocument).trackingNo}`}
              </div>
            </div>
            <div className="p-6 space-y-3">
              {notifyTarget === "all" ? (
                <p className="text-sm text-slate-700">
                  This will send an <span className="font-semibold text-amber-700">overdue alert</span> to the offices currently holding each overdue document, and to each document&apos;s requestor. Are you sure?
                </p>
              ) : (
                <p className="text-sm text-slate-700">
                  This will notify{" "}
                  <span className="font-semibold text-amber-700">
                    {(notifyTarget as OverdueDocument)._overdueInfo.currentOffice}
                  </span>{" "}
                  and the requestor about document{" "}
                  <span className="font-mono font-bold">
                    {(notifyTarget as OverdueDocument).trackingNo}
                  </span>{" "}
                  being overdue. Continue?
                </p>
              )}
              {notifyTarget !== "all" && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                  <span className="font-semibold">Overdue: </span>
                  {(notifyTarget as OverdueDocument)._overdueInfo.overdueLabel} —
                  Task: {(notifyTarget as OverdueDocument)._overdueInfo.taskName}
                </div>
              )}
            </div>
            <div className="border-t border-slate-100 px-6 py-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setNotifyTarget(null); setNotifyingId(null) }}
                disabled={notifying}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={notifying}
                onClick={() => {
                  if (notifyTarget === "all") {
                    void sendNotification()
                  } else {
                    void sendNotification([(notifyTarget as OverdueDocument)._id])
                  }
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-amber-700 disabled:opacity-60"
              >
                {notifying ? <RefreshCw className="size-3.5 animate-spin" /> : <BellRing className="size-3.5" />}
                {notifying ? "Sending…" : "Send Notification"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
