import { useEffect, useMemo, useState } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { toast } from "../../lib/toast"

const RAW_API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api"
const API_URL = RAW_API_URL.replace(/\/$/, "").endsWith("/api")
  ? RAW_API_URL.replace(/\/$/, "")
  : `${RAW_API_URL.replace(/\/$/, "")}/api`

type Section = {
  id: number
  name: string
  code: string
  description: string
  status: "active" | "archived"
  createdAt: string
}

export default function SectionsList() {
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [pageSize, setPageSize] = useState(10)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)

  const [form, setForm] = useState({
    name: "",
    code: "",
    description: "",
  })

  const [deleteConfirm, setDeleteConfirm] = useState<Section | null>(null)

  async function fetchSections() {
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem("token")
      const response = await fetch(`${API_URL}/sections`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || "Failed to fetch sections")
      }

      const data = await response.json()
      const mapped: Section[] = (data.sections || []).map((s: any) => ({
        id: Number(s.sectionId || s.id),
        name: String(s.name || ""),
        code: String(s.code || ""),
        description: String(s.description || ""),
        status: s.status === "archived" ? "archived" : "active",
        createdAt: s.createdAt ? new Date(s.createdAt).toLocaleString() : "",
      }))
      setSections(mapped)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch sections")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSections()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sections
    return sections.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    )
  }, [query, sections])

  const visible = useMemo(() => filtered.slice(0, pageSize), [filtered, pageSize])

  function resetForm() {
    setForm({ name: "", code: "", description: "" })
    setIsEditMode(false)
    setEditId(null)
  }

  function openNewModal() {
    resetForm()
    setIsModalOpen(true)
  }

  function openEditModal(section: Section) {
    setForm({
      name: section.name,
      code: section.code,
      description: section.description,
    })
    setIsEditMode(true)
    setEditId(section.id)
    setIsModalOpen(true)
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault()
    const name = form.name.trim()
    const code = form.code.trim()
    const description = form.description.trim()

    if (!name || !code) return

    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem("token")

      if (isEditMode && editId) {
        const response = await fetch(`${API_URL}/sections/${editId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name, code, description }),
        })
        if (!response.ok) {
          const msg = await response.text().catch(() => "")
          throw new Error(msg || "Failed to update section")
        }
      } else {
        const response = await fetch(`${API_URL}/sections`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name, code, description }),
        })
        if (!response.ok) {
          const msg = await response.text().catch(() => "")
          throw new Error(msg || "Failed to create section")
        }
      }

      await fetchSections()
      toast.success(isEditMode ? "Section updated successfully." : "Section created successfully.")
      setIsModalOpen(false)
      resetForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save section")
      toast.error(e instanceof Error ? e.message : "Failed to save section")
    } finally {
      setLoading(false)
    }
  }

  async function toggleStatus(section: Section) {
    const nextStatus = section.status === "active" ? "archived" : "active"
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem("token")
      const response = await fetch(`${API_URL}/sections/${section.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || "Failed to update section")
      }

      await fetchSections()
      toast.success("Section status updated successfully.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update section")
      toast.error(e instanceof Error ? e.message : "Failed to update section")
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
      const response = await fetch(`${API_URL}/sections/${deleteConfirm.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || "Failed to delete section")
      }

      await fetchSections()
      setDeleteConfirm(null)
      toast.success("Section deleted successfully.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete section")
      toast.error(e instanceof Error ? e.message : "Failed to delete section")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-base font-semibold tracking-tight text-slate-900">Sections</div>
          <div className="text-sm text-slate-600">Manage sections</div>
        </div>

        <button
          type="button"
          className="inline-flex h-8 items-center justify-center rounded-md bg-sky-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus:outline-none focus-visible:outline-none"
          onClick={openNewModal}
        >
          New Section
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600" htmlFor="sectionEntries">
            Show
          </label>
          <select
            id="sectionEntries"
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
          <label className="text-sm text-slate-600" htmlFor="sectionSearch">
            Search:
          </label>
          <input
            id="sectionSearch"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-full min-w-56 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
            placeholder="name, code, description..."
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-auto">
          {error ? <div className="p-4 text-center text-sm text-rose-600">Error: {error}</div> : null}
          {loading && sections.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-600">Loading sections...</div>
          ) : null}
          <table className="w-full min-w-[900px] text-left text-sm border-collapse border border-slate-200 [&_th]:border [&_th]:border-blue-700 [&_td]:border [&_td]:border-slate-200">
            <thead className="bg-blue-600 text-white [&_th]:text-center">
              <tr className="border-b border-blue-700">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white">ID</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white">Code</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white">Section Name</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white">Description</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white">Status</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {visible.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 align-top text-center font-medium text-slate-900">{s.id}</td>
                  <td className="px-4 py-3 align-top text-slate-700 font-mono">{s.code}</td>
                  <td className="px-4 py-3 align-top font-medium text-slate-900">{s.name}</td>
                  <td className="px-4 py-3 align-top text-slate-700">{s.description}</td>
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
                    No sections found.
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
                  {isEditMode ? "Edit Section" : "New Section"}
                </div>
              </div>
            </div>

            <form onSubmit={submitForm} className="flex-1 space-y-4 overflow-auto p-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="sectionCode">
                  Section Code <span className="text-rose-500">*</span>
                </label>
                <input
                  id="sectionCode"
                  value={form.code}
                  onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  placeholder="e.g., SEC-001"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="sectionName">
                  Section Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="sectionName"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  placeholder="e.g., Administrative Section"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="sectionDesc">
                  Description
                </label>
                <input
                  id="sectionDesc"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  placeholder="Optional description"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="submit"
                  disabled={loading || !form.name.trim() || !form.code.trim()}
                  className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:outline-none"
                >
                  {isEditMode ? "Save Changes" : "Create Section"}
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
              <div className="text-sm font-semibold text-slate-900">Delete Section</div>
            </div>
            <div className="px-4 py-4 text-sm text-slate-700">
              Are you sure you want to delete section <span className="font-semibold">"{deleteConfirm.name}"</span> (Code: {deleteConfirm.code})? This action cannot be undone.
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
