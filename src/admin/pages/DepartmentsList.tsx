import { useEffect, useMemo, useState } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { toast } from "../../lib/toast"

const RAW_API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api"
const API_URL = RAW_API_URL.replace(/\/$/, "").endsWith("/api")
  ? RAW_API_URL.replace(/\/$/, "")
  : `${RAW_API_URL.replace(/\/$/, "")}/api`

type Department = {
  id: number
  name: string
  description: string
  status: "active" | "archived"
  createdAt: string
}

type EndUserLite = {
  office: string
}

type OfficeLite = {
  officeId?: number
  name: string
  email?: string
}

export default function DepartmentsList() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [endUsers, setEndUsers] = useState<EndUserLite[]>([])
  const [offices, setOffices] = useState<OfficeLite[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)

  const [form, setForm] = useState({
    name: "",
    description: "",
    email: "",
  })

  const [deleteConfirm, setDeleteConfirm] = useState<Department | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  async function fetchDepartments() {
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem("token")
      const response = await fetch(`${API_URL}/departments`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || "Failed to fetch departments")
      }
      const data = await response.json()
      const mapped: Department[] = (data.departments || []).map((d: any) => ({
        id: Number(d.departmentId || d.id),
        name: String(d.name || ""),
        description: String(d.description || ""),
        status: d.status === "archived" ? "archived" : "active",
        createdAt: d.createdAt ? new Date(d.createdAt).toLocaleString() : "",
      }))
      setDepartments(mapped)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch departments")
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

      const data = (await response.json().catch(() => null)) as { offices?: any[] } | null
      const mapped: OfficeLite[] = Array.isArray(data?.offices)
        ? data.offices
            .filter((o: any) => o && typeof o.name === "string")
            .map((o: any) => ({
              officeId: Number(o.officeId),
              name: String(o.name || "").trim(),
              email: typeof o.email === "string" ? o.email : "",
            }))
        : []
      setOffices(mapped)
    } catch {
      // ignore
    }
  }

  async function fetchEndUsers() {
    try {
      const token = localStorage.getItem("token")
      const response = await fetch(`${API_URL}/endusers`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) return

      const data = await response.json().catch(() => null)
      const mapped: EndUserLite[] = Array.isArray(data?.users)
        ? data.users
            .filter((u: any) => u && typeof u.office === "string")
            .map((u: any) => ({ office: String(u.office || "").trim() }))
        : []
      setEndUsers(mapped)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchDepartments()
    fetchEndUsers()
    fetchOffices()
  }, [])

  const endUsersCountByDepartment = useMemo(() => {
    const counts = new Map<string, number>()
    for (const u of endUsers) {
      const key = (u.office || "").trim().toLowerCase()
      if (!key) continue
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [endUsers])

  const officeEmailByDepartment = useMemo(() => {
    const map = new Map<string, string>()
    for (const o of offices) {
      const key = String(o?.name || "").trim().toLowerCase()
      if (!key) continue
      map.set(key, String(o?.email || "").trim())
    }
    return map
  }, [offices])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = !q
      ? departments
      : departments.filter((d) => d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q))

    return [...base].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
  }, [query, departments])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / pageSize)), [filtered.length, pageSize])

  useEffect(() => {
    setPage(1)
  }, [query, pageSize])

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages))
  }, [totalPages])

  const visible = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])

  function resetForm() {
    setForm({ name: "", description: "", email: "" })
    setFormError(null)
    setIsEditMode(false)
    setEditId(null)
  }

  function openNewModal() {
    resetForm()
    setIsModalOpen(true)
  }

  function openEditModal(dept: Department) {
    const deptKey = String(dept.name || "").trim().toLowerCase()
    const currentEmail = officeEmailByDepartment.get(deptKey) ?? ""
    setForm({
      name: dept.name,
      description: dept.description,
      email: currentEmail,
    })
    setIsEditMode(true)
    setEditId(dept.id)
    setIsModalOpen(true)
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault()
    const name = form.name.trim()
    const description = form.description.trim()
    const emailValue = form.email.trim()

    if (!name) return

    // Check for duplicate name (case-insensitive)
    const isDuplicate = departments.some(
      (d) =>
        d.name.toLowerCase() === name.toLowerCase() &&
        (!isEditMode || d.id !== editId)
    )

    if (isDuplicate) {
      setFormError("A department with this name already exists.")
      return
    }

    setFormError(null)

    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem("token")

      if (isEditMode && editId) {
        const response = await fetch(`${API_URL}/departments/${editId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name, description }),
        })
        if (!response.ok) {
          const msg = await response.text().catch(() => "")
          throw new Error(msg || "Failed to update department")
        }
      } else {
        const response = await fetch(`${API_URL}/departments`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name, description }),
        })
        if (!response.ok) {
          const msg = await response.text().catch(() => "")
          throw new Error(msg || "Failed to create department")
        }
      }

      await fetchDepartments()

      try {
        const officeListRes = await fetch(`${API_URL}/offices`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (officeListRes.ok) {
          const officeListData = (await officeListRes.json().catch(() => ({}))) as { offices?: any[] }
          const officeMatch = Array.isArray(officeListData?.offices)
            ? officeListData.offices.find(
                (o: any) => String(o?.name || "").trim().toLowerCase() === name.toLowerCase()
              )
            : null

          const officeId = Number(officeMatch?.officeId)
          if (Number.isFinite(officeId)) {
            const officeEmailResponse = await fetch(`${API_URL}/offices/${officeId}`, {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ email: emailValue }),
            })

            if (!officeEmailResponse.ok) {
              const msg = await officeEmailResponse.text().catch(() => "")
              throw new Error(msg || "Failed to update office email")
            }
          }
        }
      } finally {
        await fetchOffices()
      }

      toast.success(isEditMode ? "Department updated successfully." : "Department created successfully.")
      setIsModalOpen(false)
      resetForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save department")
      toast.error(e instanceof Error ? e.message : "Failed to save department")
    } finally {
      setLoading(false)
    }
  }

  async function toggleStatus(dept: Department) {
    const nextStatus = dept.status === "active" ? "archived" : "active"
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem("token")
      const response = await fetch(`${API_URL}/departments/${dept.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || "Failed to update department")
      }

      await fetchDepartments()
      toast.success("Department status updated successfully.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update department")
      toast.error(e instanceof Error ? e.message : "Failed to update department")
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
      const response = await fetch(`${API_URL}/departments/${deleteConfirm.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || "Failed to delete department")
      }

      await fetchDepartments()
      setDeleteConfirm(null)
      toast.success("Department deleted successfully.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete department")
      toast.error(e instanceof Error ? e.message : "Failed to delete department")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-base font-semibold tracking-tight text-slate-900">Department List</div>
          <div className="text-sm text-slate-600">Manage departments</div>
        </div>

        <button
          type="button"
          className="inline-flex h-8 items-center justify-center rounded-md bg-sky-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus:outline-none focus-visible:outline-none"
          onClick={openNewModal}
        >
          New Department
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600" htmlFor="deptEntries">
              Show
            </label>
            <select
              id="deptEntries"
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
            <label className="text-sm text-slate-600" htmlFor="deptSearch">
              Search:
            </label>
            <input
              id="deptSearch"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 w-full min-w-56 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
              placeholder="name, description..."
            />
          </div>
        </div>

        <div className="overflow-auto">
          {error ? <div className="p-4 text-center text-sm text-rose-600">Error: {error}</div> : null}
          {loading && departments.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-600">Loading departments...</div>
          ) : null}
          <table className="w-full min-w-[1000px] text-center text-sm border-collapse border border-slate-200 [&_th]:border [&_th]:border-blue-700 [&_td]:border [&_td]:border-slate-200">
            <thead className="bg-blue-600 text-white">
              <tr>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">ID</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">Department Name</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">Department Description</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">Email</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">End Users</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">Status</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {visible.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 align-middle text-center font-medium text-slate-900">{d.id}</td>
                  <td className="px-4 py-3 align-middle text-center font-medium text-slate-900">{d.name}</td>
                  <td className="px-4 py-3 align-middle text-center text-slate-700">{d.description}</td>
                  <td className="px-4 py-3 align-middle text-center text-slate-700">
                    {officeEmailByDepartment.get(d.name.trim().toLowerCase()) ?? ""}
                  </td>
                  <td className="px-4 py-3 align-middle text-center font-medium text-slate-900">
                    {endUsersCountByDepartment.get(d.name.trim().toLowerCase()) ?? 0}
                  </td>
                  <td className="px-4 py-3 align-middle text-center">
                    <span
                      className={`inline-flex h-6 items-center rounded px-2 text-[11px] font-semibold ${
                        d.status === "active" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
                      }`}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle text-center">
                    <div className="flex flex-wrap items-center justify-center gap-1.5 min-w-[200px]">
                      <button
                        type="button"
                        onClick={() => openEditModal(d)}
                        className="inline-flex h-7 items-center justify-center rounded bg-sky-600 px-3 text-[11px] font-semibold text-white transition hover:bg-sky-700 focus:outline-none focus-visible:outline-none"
                      >
                        <Pencil className="size-3 mr-1" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStatus(d)}
                        className={`inline-flex h-7 items-center justify-center rounded px-3 text-[11px] font-semibold text-white transition focus:outline-none focus-visible:outline-none ${
                          d.status === "active"
                            ? "bg-rose-600 hover:bg-rose-700"
                            : "bg-emerald-600 hover:bg-emerald-700"
                        }`}
                      >
                        {d.status === "active" ? "Archive" : "Activate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(d)}
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
                  <td className="px-4 py-10 text-center text-sm text-slate-600" colSpan={7}>
                    No departments found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-600">
          {filtered.length === 0
            ? "Showing 0 to 0 of 0 entries"
            : (() => {
                const start = (page - 1) * pageSize + 1
                const end = Math.min(page * pageSize, filtered.length)
                return `Showing ${start} to ${end} of ${filtered.length} entries`
              })()}
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:outline-none"
          >
            Prev
          </button>
          <div className="text-sm text-slate-700">
            Page <span className="font-semibold text-slate-900">{page}</span> of{" "}
            <span className="font-semibold text-slate-900">{totalPages}</span>
          </div>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:outline-none"
          >
            Next
          </button>
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
                  {isEditMode ? "Edit Department" : "New Department"}
                </div>
              </div>
            </div>

            <form onSubmit={submitForm} className="flex-1 space-y-4 overflow-auto p-4">
              {formError ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {formError}
                </div>
              ) : null}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="deptName">
                  Department Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="deptName"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  placeholder="e.g., Human Resources"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="deptDesc">
                  Department Description
                </label>
                <input
                  id="deptDesc"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  placeholder="e.g., HR-related requests"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="deptEmail">
                  Email
                </label>
                <input
                  id="deptEmail"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  placeholder="name@domain.com"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="submit"
                  disabled={loading || !form.name.trim()}
                  className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:outline-none"
                >
                  {isEditMode ? "Save Changes" : "Create Department"}
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
              <div className="text-sm font-semibold text-slate-900">Delete Department</div>
            </div>
            <div className="px-4 py-4 text-sm text-slate-700">
              Are you sure you want to delete department <span className="font-semibold">"{deleteConfirm.name}"</span>? This action cannot be undone.
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
