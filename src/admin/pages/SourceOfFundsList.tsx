import { useEffect, useMemo, useState } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { toast } from "../../lib/toast"

const RAW_API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api"
const API_URL = RAW_API_URL.replace(/\/$/, "").endsWith("/api")
  ? RAW_API_URL.replace(/\/$/, "")
  : `${RAW_API_URL.replace(/\/$/, "")}/api`

type SourceOfFund = {
  id: number
  name: string
  status: "active" | "archived"
  createdAt: string
}

export default function SourceOfFundsList() {
  const [sources, setSources] = useState<SourceOfFund[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [pageSize, setPageSize] = useState(10)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)

  const [form, setForm] = useState({
    name: "",
  })

  const [deleteConfirm, setDeleteConfirm] = useState<SourceOfFund | null>(null)

  async function fetchSources() {
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem("token")
      const response = await fetch(`${API_URL}/source-of-funds`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || "Failed to fetch source of funds")
      }

      const data = await response.json()
      const mapped: SourceOfFund[] = (data.sourceOfFunds || []).map((s: any) => ({
        id: Number(s.sourceOfFundId || s.id),
        name: String(s.name || ""),
        status: s.status === "archived" ? "archived" : "active",
        createdAt: s.createdAt ? new Date(s.createdAt).toLocaleString() : "",
      }))
      setSources(mapped)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch source of funds")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSources()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sources
    return sources.filter((s) => s.name.toLowerCase().includes(q))
  }, [query, sources])

  const visible = useMemo(() => filtered.slice(0, pageSize), [filtered, pageSize])

  function resetForm() {
    setForm({ name: "" })
    setIsEditMode(false)
    setEditId(null)
  }

  function openNewModal() {
    resetForm()
    setIsModalOpen(true)
  }

  function openEditModal(source: SourceOfFund) {
    setForm({
      name: source.name,
    })
    setIsEditMode(true)
    setEditId(source.id)
    setIsModalOpen(true)
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault()
    const name = form.name.trim()

    if (!name) return

    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem("token")

      if (isEditMode && editId) {
        const response = await fetch(`${API_URL}/source-of-funds/${editId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name }),
        })
        if (!response.ok) {
          const msg = await response.text().catch(() => "")
          throw new Error(msg || "Failed to update source of fund")
        }
      } else {
        const response = await fetch(`${API_URL}/source-of-funds`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name }),
        })
        if (!response.ok) {
          const msg = await response.text().catch(() => "")
          throw new Error(msg || "Failed to create source of fund")
        }
      }

      await fetchSources()
      toast.success(isEditMode ? "Source of fund updated successfully." : "Source of fund created successfully.")
      setIsModalOpen(false)
      resetForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save source of fund")
      toast.error(e instanceof Error ? e.message : "Failed to save source of fund")
    } finally {
      setLoading(false)
    }
  }

  async function toggleStatus(source: SourceOfFund) {
    const nextStatus = source.status === "active" ? "archived" : "active"
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem("token")
      const response = await fetch(`${API_URL}/source-of-funds/${source.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || "Failed to update source of fund")
      }

      await fetchSources()
      toast.success("Source of fund status updated successfully.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update source of fund")
      toast.error(e instanceof Error ? e.message : "Failed to update source of fund")
    } finally {
      setLoading(false)
    }
  }

  async function confirmDelete() {
    if (!deleteConfirm) return
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem("token")
      const response = await fetch(`${API_URL}/source-of-funds/${deleteConfirm.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || "Failed to delete source of fund")
      }

      await fetchSources()
      setDeleteConfirm(null)
      toast.success("Source of fund deleted successfully.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete source of fund")
      toast.error(e instanceof Error ? e.message : "Failed to delete source of fund")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-base font-semibold tracking-tight text-slate-900">Source of Fund</div>
          <div className="text-sm text-slate-600">Manage source of funds</div>
        </div>

        <button
          type="button"
          className="inline-flex h-8 items-center justify-center rounded-md bg-sky-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus:outline-none focus-visible:outline-none"
          onClick={openNewModal}
        >
          New Source of Fund
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600" htmlFor="sofEntries">
              Show
            </label>
            <select
              id="sofEntries"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="text-sm text-slate-600">entries</span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600" htmlFor="sofSearch">
              Search:
            </label>
            <input
              id="sofSearch"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 w-full min-w-56 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
              placeholder="source of fund..."
            />
          </div>
        </div>

        <div className="overflow-auto">
          {error ? <div className="p-4 text-center text-sm text-rose-600">Error: {error}</div> : null}
          {loading && sources.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-600">Loading source of funds...</div>
          ) : null}
          <table className="w-full min-w-[900px] text-center text-sm border-collapse border border-slate-200 [&_th]:border [&_th]:border-blue-700 [&_td]:border [&_td]:border-slate-200">
            <thead className="bg-blue-600 text-white">
              <tr>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">ID</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">Source of Fund</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">Status</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {visible.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 align-middle text-center font-medium text-slate-900">{s.id}</td>
                  <td className="px-4 py-3 align-middle text-center font-medium text-slate-900">{s.name}</td>
                  <td className="px-4 py-3 align-middle text-center">
                    <span
                      className={`inline-flex h-6 items-center rounded px-2 text-[11px] font-semibold ${
                        s.status === "active" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle text-center">
                    <div className="flex flex-wrap items-center justify-center gap-1.5 min-w-[180px]">
                      <button
                        type="button"
                        onClick={() => openEditModal(s)}
                        className="inline-flex h-7 items-center justify-center rounded bg-sky-600 px-3 text-[11px] font-semibold text-white transition hover:bg-sky-700 focus:outline-none focus-visible:outline-none"
                      >
                        <Pencil className="size-3 mr-1" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStatus(s)}
                        className={`inline-flex h-7 items-center justify-center rounded px-3 text-[11px] font-semibold text-white transition focus:outline-none focus-visible:outline-none ${
                          s.status === "active"
                            ? "bg-rose-600 hover:bg-rose-700"
                            : "bg-emerald-600 hover:bg-emerald-700"
                        }`}
                      >
                        {s.status === "active" ? "Archive" : "Activate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(s)}
                        className="inline-flex h-7 items-center justify-center rounded bg-red-700 px-3 text-[11px] font-semibold text-white transition hover:bg-red-800 focus:outline-none focus-visible:outline-none"
                      >
                        <Trash2 className="size-3 mr-1" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {visible.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-slate-600" colSpan={4}>
                    No source of funds found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) {
              setIsModalOpen(false)
              resetForm()
            }
          }}
        >
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">
                  {isEditMode ? "Edit Source of Fund" : "New Source of Fund"}
                </div>
              </div>
            </div>

            <form onSubmit={submitForm} className="flex-1 space-y-4 overflow-auto p-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="sofName">
                  Source of Fund <span className="text-rose-500">*</span>
                </label>
                <input
                  id="sofName"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  placeholder="e.g., General Fund"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="submit"
                  disabled={loading || !form.name.trim()}
                  className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:outline-none"
                >
                  {isEditMode ? "Save Changes" : "Create Source"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false)
                    resetForm()
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Delete Confirmation Modal */}
      {deleteConfirm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) {
              setDeleteConfirm(null)
            }
          }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">Delete Source of Fund</div>
            </div>
            <div className="px-4 py-4 text-sm text-slate-700">
              Are you sure you want to delete source of fund <span className="font-semibold">"{deleteConfirm.name}"</span>? This action cannot be undone.
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={loading}
                className="inline-flex h-9 items-center justify-center rounded bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:outline-none"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
