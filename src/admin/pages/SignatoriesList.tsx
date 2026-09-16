import { useEffect, useMemo, useState } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { toast } from "../../lib/toast"

const RAW_API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api"
const API_URL = RAW_API_URL.replace(/\/$/, "").endsWith("/api")
  ? RAW_API_URL.replace(/\/$/, "")
  : `${RAW_API_URL.replace(/\/$/, "")}/api`

type Signatory = {
  id: number
  name: string
  position: string
  officeId: number | null
  officeName: string
  status: "active" | "archived"
  createdAt: string
}

type OfficeOption = {
  id: number
  name: string
}

export default function SignatoriesList() {
  const [signatories, setSignatories] = useState<Signatory[]>([])
  const [offices, setOffices] = useState<OfficeOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [pageSize, setPageSize] = useState(10)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)

  const [form, setForm] = useState({
    name: "",
    position: "",
    officeId: "",
  })

  const [deleteConfirm, setDeleteConfirm] = useState<Signatory | null>(null)

  async function fetchSignatories() {
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem("token")
      const response = await fetch(`${API_URL}/signatories`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || "Failed to fetch signatories")
      }

      const data = await response.json()
      const mapped: Signatory[] = (data.signatories || []).map((s: any) => ({
        id: Number(s.signatoryId || s.id),
        name: String(s.name || ""),
        position: String(s.position || ""),
        officeId: s.officeId ? Number(s.officeId) : null,
        officeName: String(s.officeName || s.office?.name || "-"),
        status: s.status === "archived" ? "archived" : "active",
        createdAt: s.createdAt ? new Date(s.createdAt).toLocaleString() : "",
      }))
      setSignatories(mapped)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch signatories")
    } finally {
      setLoading(false)
    }
  }

  async function fetchOffices() {
    try {
      const token = localStorage.getItem("token")
      const response = await fetch(`${API_URL}/offices`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) return
      const data = await response.json()
      const mapped: OfficeOption[] = (data.offices || [])
        .filter((o: any) => o.status !== "archived")
        .map((o: any) => ({
          id: Number(o.officeId || o.id),
          name: String(o.name || ""),
        }))
      setOffices(mapped)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchSignatories()
    fetchOffices()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return signatories
    return signatories.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.position.toLowerCase().includes(q) ||
        s.officeName.toLowerCase().includes(q)
    )
  }, [query, signatories])

  const visible = useMemo(() => filtered.slice(0, pageSize), [filtered, pageSize])

  function resetForm() {
    setForm({ name: "", position: "", officeId: "" })
    setIsEditMode(false)
    setEditId(null)
  }

  function openNewModal() {
    resetForm()
    setIsModalOpen(true)
  }

  function openEditModal(sig: Signatory) {
    setForm({
      name: sig.name,
      position: sig.position,
      officeId: sig.officeId ? String(sig.officeId) : "",
    })
    setIsEditMode(true)
    setEditId(sig.id)
    setIsModalOpen(true)
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault()
    const name = form.name.trim()
    const position = form.position.trim()
    const officeId = form.officeId ? Number(form.officeId) : null

    if (!name || !position) return

    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem("token")

      if (isEditMode && editId) {
        const response = await fetch(`${API_URL}/signatories/${editId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name, position, officeId }),
        })
        if (!response.ok) {
          const msg = await response.text().catch(() => "")
          throw new Error(msg || "Failed to update signatory")
        }
      } else {
        const response = await fetch(`${API_URL}/signatories`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name, position, officeId }),
        })
        if (!response.ok) {
          const msg = await response.text().catch(() => "")
          throw new Error(msg || "Failed to create signatory")
        }
      }

      await fetchSignatories()
      toast.success(isEditMode ? "Signatory updated successfully." : "Signatory created successfully.")
      setIsModalOpen(false)
      resetForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save signatory")
      toast.error(e instanceof Error ? e.message : "Failed to save signatory")
    } finally {
      setLoading(false)
    }
  }

  async function toggleStatus(sig: Signatory) {
    const nextStatus = sig.status === "active" ? "archived" : "active"
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem("token")
      const response = await fetch(`${API_URL}/signatories/${sig.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || "Failed to update signatory")
      }

      await fetchSignatories()
      toast.success("Signatory status updated successfully.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update signatory")
      toast.error(e instanceof Error ? e.message : "Failed to update signatory")
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
      const response = await fetch(`${API_URL}/signatories/${deleteConfirm.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || "Failed to delete signatory")
      }

      await fetchSignatories()
      setDeleteConfirm(null)
      toast.success("Signatory deleted successfully.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete signatory")
      toast.error(e instanceof Error ? e.message : "Failed to delete signatory")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-base font-semibold tracking-tight text-slate-900">Signatories</div>
          <div className="text-sm text-slate-600">Manage signatories</div>
        </div>

        <button
          type="button"
          className="inline-flex h-8 items-center justify-center rounded-md bg-sky-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus:outline-none focus-visible:outline-none"
          onClick={openNewModal}
        >
          New Signatory
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600" htmlFor="sigEntries">
            Show
          </label>
          <select
            id="sigEntries"
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
          <label className="text-sm text-slate-600" htmlFor="sigSearch">
            Search:
          </label>
          <input
            id="sigSearch"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-full min-w-56 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
            placeholder="name, position, office..."
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-auto">
          {error ? <div className="p-4 text-center text-sm text-rose-600">Error: {error}</div> : null}
          {loading && signatories.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-600">Loading signatories...</div>
          ) : null}
          <table className="w-full min-w-[900px] text-left text-sm border-collapse border border-slate-200 [&_th]:border [&_th]:border-blue-700 [&_td]:border [&_td]:border-slate-200">
            <thead className="bg-blue-600 text-white [&_th]:text-center">
              <tr className="border-b border-blue-700">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white">ID</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white">Name</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white">Position</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white">Office</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white">Status</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {visible.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 align-top text-center font-medium text-slate-900">{s.id}</td>
                  <td className="px-4 py-3 align-top font-medium text-slate-900">{s.name}</td>
                  <td className="px-4 py-3 align-top text-slate-700">{s.position}</td>
                  <td className="px-4 py-3 align-top text-slate-700">{s.officeName}</td>
                  <td className="px-4 py-3 align-top text-center">
                    <span
                      className={`inline-flex h-6 items-center rounded px-2 text-[11px] font-semibold ${
                        s.status === "active" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center justify-center gap-2">
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
                  <td className="px-4 py-10 text-center text-sm text-slate-600" colSpan={6}>
                    No signatories found.
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
                  {isEditMode ? "Edit Signatory" : "New Signatory"}
                </div>
              </div>
            </div>

            <form onSubmit={submitForm} className="flex-1 space-y-4 overflow-auto p-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="sigName">
                  Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="sigName"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  placeholder="e.g., Juan Dela Cruz"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="sigPosition">
                  Position <span className="text-rose-500">*</span>
                </label>
                <input
                  id="sigPosition"
                  value={form.position}
                  onChange={(e) => setForm((p) => ({ ...p, position: e.target.value }))}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  placeholder="e.g., Department Head"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="sigOffice">
                  Office
                </label>
                <select
                  id="sigOffice"
                  value={form.officeId}
                  onChange={(e) => setForm((p) => ({ ...p, officeId: e.target.value }))}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                >
                  <option value="">-- Select Office (Optional) --</option>
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="submit"
                  disabled={loading || !form.name.trim() || !form.position.trim()}
                  className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:outline-none"
                >
                  {isEditMode ? "Save Changes" : "Create Signatory"}
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
              <div className="text-sm font-semibold text-slate-900">Delete Signatory</div>
            </div>
            <div className="px-4 py-4 text-sm text-slate-700">
              Are you sure you want to delete signatory <span className="font-semibold">"{deleteConfirm.name}"</span> ({deleteConfirm.position})? This action cannot be undone.
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
