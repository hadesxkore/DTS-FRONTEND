import { useEffect, useMemo, useState } from "react"
import EndUsersPage from "./EndUsersPage"
import ProcurementUsersPage from "./ProcurementUsersPage"
import DepartmentsList from "./DepartmentsList"
import SourceOfFundsList from "./SourceOfFundsList"
import { toast } from "../../lib/toast"

type OfficeType = "operating" | "viewing"

type OfficeStatus = "active" | "archived"

type OfficeRow = {
  id: number
  name: string
  description: string
  email: string
  head: string
  headDesignation: string
  createdAt: string
  type: OfficeType
  status: OfficeStatus
  privileges: string[]
}

type OfficeTaskStatus = "active" | "archived"

type OfficeTask = {
  id: number
  task: string
  duration: string
  status: OfficeTaskStatus
}

const RAW_API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api"
const API_URL = RAW_API_URL.replace(/\/$/, "").endsWith("/api")
  ? RAW_API_URL.replace(/\/$/, "")
  : `${RAW_API_URL.replace(/\/$/, "")}/api`

const privilegeOptions: string[] = [
  "Update PR",
  "Update CAFOA",
  "Update Amount",
  "Complete Request",
  "Update Source of Fund",
  "Update Payment Type",
  "BAC Notes",
  "Request Approval",
  "Update Supplier",
  "Office Requests",
]

type OfficesPageProps = {
  title?: string
}

type OfficesTab = "offices" | "procurement-users" | "end-users" | "departments" | "source-of-funds"

type OfficeFormModel = {
  name: string
  description: string
  head: string
  headDesignation: string
  type: OfficeType
}

const typeBadgeClass: Record<OfficeType, string> = {
  operating: "bg-amber-400 text-slate-900",
  viewing: "bg-slate-200 text-slate-900",
}

const statusBadgeClass: Record<OfficeStatus, string> = {
  active: "bg-emerald-600 text-white",
  archived: "bg-rose-600 text-white",
}

export default function OfficesPage({ title = "Offices" }: OfficesPageProps) {
  const [tab, setTab] = useState<OfficesTab>("offices")
  const [rows, setRows] = useState<OfficeRow[]>([])
  const [query, setQuery] = useState("")
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [isNewOfficeOpen, setIsNewOfficeOpen] = useState(false)
  const [editOffice, setEditOffice] = useState<OfficeRow | null>(null)
  const [isPrivilegesOpen, setIsPrivilegesOpen] = useState<OfficeRow | null>(null)

  const [emailOffice, setEmailOffice] = useState<OfficeRow | null>(null)
  const [emailValue, setEmailValue] = useState("")

  const [tasksOffice, setTasksOffice] = useState<OfficeRow | null>(null)
  const [tasksByOfficeId, setTasksByOfficeId] = useState<Record<number, OfficeTask[]>>({})
  const [taskQuery, setTaskQuery] = useState("")
  const [taskPageSize, setTaskPageSize] = useState(10)
  const [newTaskName, setNewTaskName] = useState("")
  const [newTaskDuration, setNewTaskDuration] = useState("")
  const [editTask, setEditTask] = useState<{ officeId: number; taskId: number } | null>(null)
  const [editTaskName, setEditTaskName] = useState("")
  const [editTaskDuration, setEditTaskDuration] = useState("")

  const [officeToDelete, setOfficeToDelete] = useState<OfficeRow | null>(null)

  const [pendingPrivilegeChange, setPendingPrivilegeChange] = useState<
    { officeId: number; officeName: string; privilege: string; nextChecked: boolean } | null
  >(null)
  const [privilegeChangeSuccess, setPrivilegeChangeSuccess] = useState<string | null>(null)

  async function fetchOffices() {
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/offices`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || "Failed to fetch offices")
      }

      const data = (await response.json()) as {
        offices: Array<{
          officeId: number
          name: string
          description: string
          email?: string
          head: string
          headDesignation?: string
          type: OfficeType
          status: OfficeStatus
          privileges?: string[]
          tasks?: Array<{ taskId: number; task: string; duration: string; status: OfficeTaskStatus }>
          createdAt?: string
        }>
      }

      const mappedRows: OfficeRow[] = (data.offices || []).map((o) => ({
        id: Number(o.officeId),
        name: String(o.name || ""),
        description: String(o.description || ""),
        email: String(o.email || ""),
        head: String(o.head || ""),
        headDesignation: String(o.headDesignation || ""),
        createdAt: o.createdAt ? new Date(o.createdAt).toLocaleString() : "",
        type: o.type === "viewing" ? "viewing" : "operating",
        status: o.status === "archived" ? "archived" : "active",
        privileges: Array.isArray(o.privileges) ? o.privileges.map(String) : [],
      }))

      const mappedTasks: Record<number, OfficeTask[]> = {}
      for (const o of data.offices || []) {
        mappedTasks[Number(o.officeId)] = Array.isArray(o.tasks)
          ? o.tasks.map((t) => ({
            id: Number(t.taskId),
            task: String(t.task || ""),
            duration: String(t.duration || ""),
            status: t.status === "archived" ? "archived" : "active",
          }))
          : []
      }

      setRows(mappedRows)
      setTasksByOfficeId(mappedTasks)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch offices")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOffices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [form, setForm] = useState<OfficeFormModel>({
    name: "",
    description: "",
    head: "",
    headDesignation: "",
    type: "operating",
  })

  const [editForm, setEditForm] = useState<OfficeFormModel>({
    name: "",
    description: "",
    head: "",
    headDesignation: "",
    type: "operating",
  })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      return (
        String(r.id).includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.head.toLowerCase().includes(q)
      )
    })
  }, [query, rows])

  const visible = useMemo(() => filtered.slice(0, pageSize), [filtered, pageSize])

  function resetForm() {
    setForm({ name: "", description: "", head: "", headDesignation: "", type: "operating" })
  }

  function resetEditForm() {
    setEditForm({ name: "", description: "", head: "", headDesignation: "", type: "operating" })
  }

  useEffect(() => {
    if (!editOffice) return
    setEditForm({
      name: String(editOffice.name || ""),
      description: String(editOffice.description || ""),
      head: String(editOffice.head || ""),
      headDesignation: String(editOffice.headDesignation || ""),
      type: editOffice.type === "viewing" ? "viewing" : "operating",
    })
  }, [editOffice])

  async function submitOfficeEmail() {
    if (!emailOffice) return
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/offices/${emailOffice.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: emailValue.trim() }),
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || 'Failed to update office email')
      }

      await fetchOffices()
      setEmailOffice(null)
      setEmailValue("")
      toast.success("Office email updated successfully.")
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update office email')
      toast.error(e instanceof Error ? e.message : 'Failed to update office email')
    } finally {
      setLoading(false)
    }
  }

  function submitNewOffice(e: React.FormEvent) {
    e.preventDefault()

    const name = form.name.trim()
    const description = form.description.trim()
    const head = form.head.trim()
    const headDesignation = form.headDesignation.trim()

    if (!name || !description || !head) return

      ; (async () => {
        try {
          setLoading(true)
          setError(null)
          const token = localStorage.getItem('token')
          const response = await fetch(`${API_URL}/offices`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name,
              description,
              head,
              headDesignation,
              type: form.type,
            }),
          })

          if (!response.ok) {
            const msg = await response.text().catch(() => "")
            throw new Error(msg || "Failed to create office")
          }

          await fetchOffices()
          setIsNewOfficeOpen(false)
          resetForm()
          toast.success("Office created successfully.")
        } catch (e2) {
          setError(e2 instanceof Error ? e2.message : "Failed to create office")
          toast.error(e2 instanceof Error ? e2.message : "Failed to create office")
        } finally {
          setLoading(false)
        }
      })()
  }

  function submitEditOffice(e: React.FormEvent) {
    e.preventDefault()
    if (!editOffice) return

    const name = editForm.name.trim()
    const description = editForm.description.trim()
    const head = editForm.head.trim()
    const headDesignation = editForm.headDesignation.trim()

    if (!name || !description || !head) return

      ; (async () => {
        try {
          setLoading(true)
          setError(null)
          const token = localStorage.getItem('token')
          const response = await fetch(`${API_URL}/offices/${editOffice.id}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name,
              description,
              head,
              headDesignation,
              type: editForm.type,
            }),
          })

          if (!response.ok) {
            const msg = await response.text().catch(() => "")
            throw new Error(msg || 'Failed to update office')
          }

          await fetchOffices()
          setEditOffice(null)
          resetEditForm()
          toast.success("Office updated successfully.")
        } catch (e2) {
          setError(e2 instanceof Error ? e2.message : 'Failed to update office')
          toast.error(e2 instanceof Error ? e2.message : 'Failed to update office')
        } finally {
          setLoading(false)
        }
      })()
  }

  function deleteOffice(row: OfficeRow) {
    setOfficeToDelete(row)
  }

  async function confirmDeleteOffice() {
    if (!officeToDelete) return
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem("token")
      const response = await fetch(`${API_URL}/offices/${officeToDelete.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || "Failed to delete office")
      }

      await fetchOffices()
      setOfficeToDelete(null)
      toast.success("Office deleted successfully.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete office")
      toast.error(e instanceof Error ? e.message : "Failed to delete office")
    } finally {
      setLoading(false)
    }
  }

  async function submitEditTask() {
    if (!editTask) return
    const task = editTaskName.trim()
    const duration = editTaskDuration.trim()
    if (!task || !duration) return

    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/offices/${editTask.officeId}/tasks/${editTask.taskId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ task, duration }),
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || "Failed to update task")
      }

      await fetchOffices()
      setEditTask(null)
      setEditTaskName("")
      setEditTaskDuration("")
      toast.success("Task updated successfully.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update task")
      toast.error(e instanceof Error ? e.message : "Failed to update task")
    } finally {
      setLoading(false)
    }
  }

  function toggleArchive(row: OfficeRow) {
    const nextStatus: OfficeStatus = row.status === "active" ? "archived" : "active"
      ; (async () => {
        try {
          setLoading(true)
          setError(null)
          const token = localStorage.getItem('token')
          const response = await fetch(`${API_URL}/offices/${row.id}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: nextStatus }),
          })

          if (!response.ok) {
            const msg = await response.text().catch(() => "")
            throw new Error(msg || "Failed to update office")
          }

          await fetchOffices()
          toast.success("Office status updated successfully.")
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to update office")
          toast.error(e instanceof Error ? e.message : "Failed to update office")
        } finally {
          setLoading(false)
        }
      })()
  }

  const isNewOfficeModalOpen = isNewOfficeOpen
  const isEditOfficeModalOpen = editOffice !== null
  const isPrivilegesModalOpen = isPrivilegesOpen !== null
  const isTasksModalOpen = tasksOffice !== null
  const isDeleteOfficeModalOpen = officeToDelete !== null

  const tasksForSelectedOffice = useMemo(() => {
    if (!tasksOffice) return []
    return tasksByOfficeId[tasksOffice.id] ?? []
  }, [tasksByOfficeId, tasksOffice])

  const filteredTasks = useMemo(() => {
    const q = taskQuery.trim().toLowerCase()
    if (!q) return tasksForSelectedOffice
    return tasksForSelectedOffice.filter((t) => {
      return String(t.id).includes(q) || t.task.toLowerCase().includes(q) || t.duration.toLowerCase().includes(q)
    })
  }, [taskQuery, tasksForSelectedOffice])

  const visibleTasks = useMemo(() => filteredTasks.slice(0, taskPageSize), [filteredTasks, taskPageSize])

  const allPrivilegeOptions = useMemo(() => {
    const set = new Set<string>()
    for (const p of privilegeOptions) set.add(p)
    for (const r of rows) {
      for (const p of r.privileges || []) {
        if (String(p) === "End User") continue
        if (String(p).trim().toLowerCase() === "hold document") continue
        set.add(String(p))
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows])

  async function setPrivilegeChecked(officeId: number, privilege: string, checked: boolean) {
    const office = rows.find((r) => r.id === officeId)
    if (!office) return false

    const set = new Set(office.privileges)
    if (checked) set.add(privilege)
    else set.delete(privilege)
    const nextPrivileges = Array.from(set)

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/offices/${officeId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ privileges: nextPrivileges }),
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || 'Failed to update office privileges')
      }

      setRows((prev) => prev.map((r) => (r.id === officeId ? { ...r, privileges: nextPrivileges } : r)))

      setIsPrivilegesOpen((prev) => {
        if (!prev) return prev
        if (prev.id !== officeId) return prev
        return { ...prev, privileges: nextPrivileges }
      })

      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update office privileges')
      return false
    }
  }

  function requestPrivilegeChange(office: OfficeRow, privilege: string, nextChecked: boolean) {
    setPendingPrivilegeChange({
      officeId: office.id,
      officeName: office.name,
      privilege,
      nextChecked,
    })
  }

  function cancelPrivilegeChange() {
    setPendingPrivilegeChange(null)
  }

  async function confirmPrivilegeChange() {
    if (!pendingPrivilegeChange) return
    const { officeId, officeName, privilege, nextChecked } = pendingPrivilegeChange
    setPendingPrivilegeChange(null)

    const ok = await setPrivilegeChecked(officeId, privilege, nextChecked)
    if (!ok) return

    setPrivilegeChangeSuccess(
      `${privilege} privilege has been ${nextChecked ? 'enabled' : 'disabled'} for ${officeName}.`
    )
  }

  function toggleTaskStatus(officeId: number, taskId: number) {
    const current = tasksByOfficeId[officeId] ?? []
    const task = current.find((t) => t.id === taskId)
    const nextStatus: OfficeTaskStatus = task?.status === "active" ? "archived" : "active"

    setTasksByOfficeId((prev) => {
      const list = prev[officeId] ?? []
      return {
        ...prev,
        [officeId]: list.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)),
      }
    })

      ; (async () => {
        try {
          const token = localStorage.getItem('token')
          await fetch(`${API_URL}/offices/${officeId}/tasks/${taskId}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: nextStatus }),
          })
        } catch {
          // ignore
        }
      })()
  }

  function submitNewTask(e: React.FormEvent) {
    e.preventDefault()
    if (!tasksOffice) return

    const task = newTaskName.trim()
    const duration = newTaskDuration.trim()
    if (!task || !duration) return

      ; (async () => {
        try {
          setLoading(true)
          setError(null)
          const token = localStorage.getItem('token')
          const response = await fetch(`${API_URL}/offices/${tasksOffice.id}/tasks`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ task, duration }),
          })

          if (!response.ok) {
            const msg = await response.text().catch(() => "")
            throw new Error(msg || "Failed to add task")
          }

          await fetchOffices()
          setNewTaskName("")
          setNewTaskDuration("")
          toast.success("Task added successfully.")
        } catch (e2) {
          setError(e2 instanceof Error ? e2.message : "Failed to add task")
          toast.error(e2 instanceof Error ? e2.message : "Failed to add task")
        } finally {
          setLoading(false)
        }
      })()
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 ring-1 ring-inset ring-blue-700/10">
              The Bunker &bull; Bataan Capitol DTS
            </span>
          </div>
          <div className="mt-1 text-lg font-bold tracking-tight text-slate-900">{title}</div>
          <div className="text-xs text-slate-500">
            {tab === "offices"
              ? "Provincial operating and viewing office directory"
              : tab === "procurement-users"
                ? "Procurement office workflow accounts"
                : tab === "end-users"
                  ? "Department end-user accounts and privileges"
                  : tab === "departments"
                    ? "Provincial department list & designations"
                    : "Source of fund categories and allocation codes"}
          </div>
        </div>

        {tab === "offices" ? (
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-700 focus:outline-none focus-visible:outline-none"
            onClick={() => setIsNewOfficeOpen(true)}
          >
            + New Office
          </button>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white p-1.5 shadow-sm">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setTab("offices")}
            className={`inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition focus:outline-none focus-visible:outline-none ${tab === "offices"
                ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
          >
            Offices
          </button>
          <button
            type="button"
            onClick={() => setTab("procurement-users")}
            className={`inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition focus:outline-none focus-visible:outline-none ${tab === "procurement-users"
                ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
          >
            Procurement Users
          </button>
          <button
            type="button"
            onClick={() => setTab("end-users")}
            className={`inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition focus:outline-none focus-visible:outline-none ${tab === "end-users"
                ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
          >
            End Users
          </button>
          <button
            type="button"
            onClick={() => setTab("departments")}
            className={`inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition focus:outline-none focus-visible:outline-none ${tab === "departments"
                ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
          >
            Department List
          </button>
          <button
            type="button"
            onClick={() => setTab("source-of-funds")}
            className={`inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition focus:outline-none focus-visible:outline-none ${tab === "source-of-funds"
                ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
          >
            Source of Fund
          </button>
        </div>
      </div>

      {tab === "offices" ? (
        <>
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500" htmlFor="entries">
                Show
              </label>
              <select
                id="entries"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-9 rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-slate-50/80 px-2.5 text-xs font-semibold text-slate-800 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="text-xs font-medium text-slate-500">entries</span>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500" htmlFor="search">
                Search:
              </label>
              <input
                id="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9 w-full min-w-56 rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-slate-50/80 px-3 text-xs text-slate-900 placeholder:text-slate-400 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="ID, name, head..."
              />
            </div>
          </div>

          <div className="overflow-auto">
            {error ? <div className="p-4 text-center text-sm text-rose-600">Error: {error}</div> : null}
            {loading ? <div className="p-4 text-center text-sm text-slate-600">Loading offices...</div> : null}
            <table className="w-full min-w-[1200px] text-center text-sm border-collapse border border-slate-200 [&_th]:border [&_th]:border-blue-700 [&_td]:border [&_td]:border-slate-200">
              <thead className="bg-blue-600 text-white border-b border-blue-700">
                <tr>
                  <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-white">Office ID</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-white">Office Name</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-white">Description</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-white">Email</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-white">Office Head</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-white">Office Head Designation</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-white">Created</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-white">Type</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-white">Status</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-white">Privileges</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-white">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 align-middle text-center font-medium text-slate-900">{r.id}</td>
                    <td className="px-4 py-3 align-middle text-center font-medium text-slate-900">{r.name}</td>
                    <td className="px-4 py-3 align-middle text-center text-slate-700">{r.description}</td>
                    <td className="px-4 py-3 align-middle text-center text-slate-700">{r.email}</td>
                    <td className="px-4 py-3 align-middle text-center text-slate-700">{r.head}</td>
                    <td className="px-4 py-3 align-middle text-center text-slate-700">{r.headDesignation}</td>
                    <td className="px-4 py-3 align-middle text-center text-slate-700">{r.createdAt}</td>
                    <td className="px-4 py-3 align-middle text-center">
                      <span
                        className={`inline-flex h-6 items-center rounded px-2 text-[11px] font-semibold ${typeBadgeClass[r.type]}`}
                      >
                        {r.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle text-center">
                      <span
                        className={`inline-flex h-6 items-center rounded px-2 text-[11px] font-semibold ${statusBadgeClass[r.status]}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle text-center">
                      <button
                        type="button"
                        className="inline-flex h-7 items-center justify-center rounded bg-sky-600 px-3 text-[11px] font-semibold text-white transition hover:bg-sky-700 focus:outline-none focus-visible:outline-none"
                        onClick={() => {
                          setIsPrivilegesOpen(r)
                        }}
                      >
                        Show Privileges
                      </button>
                    </td>
                    <td className="px-4 py-3 align-middle text-center">
                      <div className="flex flex-wrap items-center justify-center gap-1.5 min-w-[240px]">
                        <button
                          type="button"
                          className="inline-flex h-7 items-center justify-center rounded bg-indigo-600 px-3 text-[11px] font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus-visible:outline-none"
                          onClick={() => {
                            setEditOffice(r)
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-7 items-center justify-center rounded bg-slate-900 px-3 text-[11px] font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus-visible:outline-none"
                          onClick={() => {
                            setEmailOffice(r)
                            setEmailValue(r.email)
                          }}
                        >
                          Update Email
                        </button>
                        <button
                          type="button"
                          className={`inline-flex h-7 items-center justify-center rounded px-3 text-[11px] font-semibold text-white transition focus:outline-none focus-visible:outline-none ${r.status === "active"
                              ? "bg-rose-600 hover:bg-rose-700"
                              : "bg-emerald-600 hover:bg-emerald-700"
                            }`}
                          onClick={() => toggleArchive(r)}
                        >
                          {r.status === "active" ? "Archive" : "Activate"}
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-7 items-center justify-center rounded bg-red-700 px-3 text-[11px] font-semibold text-white transition hover:bg-red-800 focus:outline-none focus-visible:outline-none"
                          onClick={() => deleteOffice(r)}
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-7 items-center justify-center rounded border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                          onClick={() => {
                            setTasksOffice(r)
                            setTaskQuery("")
                            setTaskPageSize(10)
                            setNewTaskName("")
                            setNewTaskDuration("")
                          }}
                        >
                          View Tasks
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {visible.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-sm text-slate-600" colSpan={11}>
                      No results.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

          {isEditOfficeModalOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => {
                if (e.currentTarget === e.target) {
                  setEditOffice(null)
                  resetEditForm()
                }
              }}
            >
              <div className="flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">Edit Office</div>
                    <div className="truncate text-xs text-slate-600">{editOffice?.name}</div>
                  </div>
                </div>

                <form onSubmit={submitEditOffice} className="flex-1 space-y-4 overflow-auto p-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700" htmlFor="editOfficeName">
                      Office Name
                    </label>
                    <input
                      id="editOfficeName"
                      value={editForm.name}
                      onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700" htmlFor="editOfficeDesc">
                      Office Description
                    </label>
                    <input
                      id="editOfficeDesc"
                      value={editForm.description}
                      onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700" htmlFor="editOfficeHead">
                      Office Head
                    </label>
                    <input
                      id="editOfficeHead"
                      value={editForm.head}
                      onChange={(e) => setEditForm((p) => ({ ...p, head: e.target.value }))}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700" htmlFor="editOfficeHeadDesignation">
                      Office Head Designation
                    </label>
                    <input
                      id="editOfficeHeadDesignation"
                      value={editForm.headDesignation}
                      onChange={(e) => setEditForm((p) => ({ ...p, headDesignation: e.target.value }))}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700" htmlFor="editOfficeType">
                      Office Type
                    </label>
                    <select
                      id="editOfficeType"
                      value={editForm.type}
                      onChange={(e) => setEditForm((p) => ({ ...p, type: e.target.value as OfficeType }))}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                    >
                      <option value="operating">operating</option>
                      <option value="viewing">viewing</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:outline-none"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditOffice(null)
                        resetEditForm()
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                    >
                      Close
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}

          {emailOffice ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => {
                if (e.currentTarget === e.target) {
                  setEmailOffice(null)
                  setEmailValue("")
                }
              }}
            >
              <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">Update Office Email</div>
                    <div className="truncate text-xs text-slate-600">{emailOffice.name}</div>
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-slate-700" htmlFor="officeEmail">
                      Email
                    </label>
                    <input
                      id="officeEmail"
                      type="email"
                      value={emailValue}
                      onChange={(e) => setEmailValue(e.target.value)}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                      placeholder="name@domain.com"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEmailOffice(null)
                      setEmailValue("")
                    }}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={submitOfficeEmail}
                    className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:outline-none"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {isNewOfficeModalOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => {
                if (e.currentTarget === e.target) {
                  setIsNewOfficeOpen(false)
                }
              }}
            >
              <div className="flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">New Office</div>
                  </div>
                </div>

                <form onSubmit={submitNewOffice} className="flex-1 space-y-4 overflow-auto p-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700" htmlFor="officeName">
                      Office Name
                    </label>
                    <input
                      id="officeName"
                      value={form.name}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700" htmlFor="officeDesc">
                      Office Description
                    </label>
                    <input
                      id="officeDesc"
                      value={form.description}
                      onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700" htmlFor="officeHead">
                      Office Head
                    </label>
                    <input
                      id="officeHead"
                      value={form.head}
                      onChange={(e) => setForm((p) => ({ ...p, head: e.target.value }))}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700" htmlFor="officeHeadDesignation">
                      Office Head Designation
                    </label>
                    <input
                      id="officeHeadDesignation"
                      value={form.headDesignation}
                      onChange={(e) => setForm((p) => ({ ...p, headDesignation: e.target.value }))}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700" htmlFor="officeType">
                      Office Type
                    </label>
                    <select
                      id="officeType"
                      value={form.type}
                      onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as OfficeType }))}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                    >
                      <option value="operating">operating</option>
                      <option value="viewing">viewing</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="submit"
                      className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:outline-none"
                    >
                      Submit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewOfficeOpen(false)
                        resetForm()
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                    >
                      Close
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}

          {isDeleteOfficeModalOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => {
                if (e.currentTarget === e.target) {
                  setOfficeToDelete(null)
                }
              }}
            >
              <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div className="text-sm font-semibold text-slate-900">Delete Office</div>
                </div>
                <div className="px-4 py-4 text-sm text-slate-700">
                  Are you sure you want to permanently delete office
                  {" "}
                  <span className="font-semibold">"{officeToDelete?.name}"</span>
                  {" "}
                  (ID {officeToDelete?.id})? This action cannot be undone.
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setOfficeToDelete(null)}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmDeleteOffice}
                    className="inline-flex h-9 items-center justify-center rounded bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 focus:outline-none focus-visible:outline-none"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {isPrivilegesModalOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => {
                if (e.currentTarget === e.target) {
                  setIsPrivilegesOpen(null)
                }
              }}
            >
              <div className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">Privileges</div>
                    <div className="truncate text-xs text-slate-600">{isPrivilegesOpen?.name}</div>
                  </div>
                </div>

                <div className="flex-1 space-y-3 overflow-auto p-4">
                  <div className="overflow-auto rounded-md border border-slate-200 bg-white p-3">
                    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                      {allPrivilegeOptions.map((p) => {
                        const checked = Boolean(isPrivilegesOpen?.privileges?.includes(p))
                        return (
                          <div key={p} className="flex items-center justify-between gap-3 text-sm text-slate-900">
                            <span className="truncate">{p}</span>
                            <button
                              type="button"
                              onClick={() => {
                                if (!isPrivilegesOpen) return
                                requestPrivilegeChange(isPrivilegesOpen, p, !checked)
                              }}
                              aria-label={`${checked ? 'Disable' : 'Enable'} ${p}`}
                              title={`${checked ? 'Disable' : 'Enable'} ${p}`}
                              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border text-xs font-medium transition-colors focus:outline-none focus-visible:outline-none ${checked
                                  ? "border-emerald-500 bg-emerald-500"
                                  : "border-slate-300 bg-slate-200"
                                }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-1"
                                  }`}
                              />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setIsPrivilegesOpen(null)}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {pendingPrivilegeChange ? (
            <div
              className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4"
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => {
                if (e.currentTarget === e.target) {
                  cancelPrivilegeChange()
                }
              }}
            >
              <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">Confirm Privilege Change</div>
                    <div className="truncate text-xs text-slate-600">{pendingPrivilegeChange.officeName}</div>
                  </div>
                </div>

                <div className="space-y-2 px-4 py-4 text-sm text-slate-700">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Action</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {pendingPrivilegeChange.nextChecked ? "Enable" : "Disable"} "{pendingPrivilegeChange.privilege}" privilege?
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      This will {pendingPrivilegeChange.nextChecked ? "allow" : "prevent"} procurement users in this office from using this feature.
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                  <button
                    type="button"
                    onClick={cancelPrivilegeChange}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmPrivilegeChange}
                    className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:outline-none"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {privilegeChangeSuccess ? (
            <div
              className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4"
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => {
                if (e.currentTarget === e.target) {
                  setPrivilegeChangeSuccess(null)
                }
              }}
            >
              <div className="w-full max-w-md overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-emerald-800">Privilege Updated</div>
                  </div>
                </div>

                <div className="px-4 py-4 text-sm text-emerald-800">{privilegeChangeSuccess}</div>

                <div className="flex items-center justify-end gap-2 border-t border-emerald-200 bg-emerald-50 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setPrivilegeChangeSuccess(null)}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-emerald-200 bg-white px-4 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 focus:outline-none focus-visible:outline-none"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {isTasksModalOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => {
                if (e.currentTarget === e.target) {
                  setTasksOffice(null)
                }
              }}
            >
              <div className="flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">Office Tasks</div>
                  </div>
                </div>

                <div className="flex-1 space-y-4 overflow-auto p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-600" htmlFor="taskEntries">
                        Show
                      </label>
                      <select
                        id="taskEntries"
                        value={taskPageSize}
                        onChange={(e) => setTaskPageSize(Number(e.target.value))}
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
                      <label className="text-sm text-slate-600" htmlFor="taskSearch">
                        Search:
                      </label>
                      <input
                        id="taskSearch"
                        value={taskQuery}
                        onChange={(e) => setTaskQuery(e.target.value)}
                        className="h-9 w-full min-w-56 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                      />
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
                    <div className="overflow-auto">
                      <table className="w-full table-fixed text-left text-sm border-collapse border border-slate-200 [&_th]:border [&_th]:border-blue-700 [&_td]:border [&_td]:border-slate-200">
                        <thead className="bg-blue-600 text-white">
                          <tr className="border-b border-blue-700">
                            <th className="w-20 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">
                              Task ID
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">
                              Task
                            </th>
                            <th className="w-40 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">
                              Duration
                            </th>
                            <th className="w-28 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">
                              Status
                            </th>
                            <th className="w-28 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {visibleTasks.map((t) => (
                            <tr key={t.id} className="hover:bg-slate-50">
                              <td className="px-4 py-3 align-top text-center font-medium text-slate-900">{t.id}</td>
                              <td className="px-4 py-3 align-top text-slate-700 wrap-break-word">{t.task}</td>
                              <td className="px-4 py-3 align-top text-slate-700">{t.duration}</td>
                              <td className="px-4 py-3 align-top text-center">
                                <span
                                  className={`inline-flex h-6 items-center rounded px-2 text-[11px] font-semibold ${t.status === "active" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
                                    }`}
                                >
                                  {t.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 align-top text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    type="button"
                                    className="inline-flex h-7 items-center justify-center rounded bg-sky-600 px-3 text-[11px] font-semibold text-white transition hover:bg-sky-700 focus:outline-none focus-visible:outline-none"
                                    onClick={() => {
                                      if (!tasksOffice) return
                                      setEditTask({ officeId: tasksOffice.id, taskId: t.id })
                                      setEditTaskName(t.task)
                                      setEditTaskDuration(t.duration)
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className={`inline-flex h-7 items-center justify-center rounded px-3 text-[11px] font-semibold text-white transition focus:outline-none focus-visible:outline-none ${t.status === "active"
                                        ? "bg-rose-600 hover:bg-rose-700"
                                        : "bg-emerald-600 hover:bg-emerald-700"
                                      }`}
                                    onClick={() => {
                                      if (!tasksOffice) return
                                      toggleTaskStatus(tasksOffice.id, t.id)
                                    }}
                                  >
                                    {t.status === "active" ? "Archive" : "Activate"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}

                          {visibleTasks.length === 0 ? (
                            <tr>
                              <td className="px-4 py-10 text-center text-sm text-slate-600" colSpan={5}>
                                No results.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-4">
                    <div className="text-sm font-semibold text-slate-900">Add New Task</div>
                    <form onSubmit={submitNewTask} className="mt-3 space-y-3">
                      <div className="space-y-1">
                        <label className="text-sm text-slate-700" htmlFor="newTask">
                          Add New Task
                        </label>
                        <input
                          id="newTask"
                          value={newTaskName}
                          onChange={(e) => setNewTaskName(e.target.value)}
                          className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-sm text-slate-700" htmlFor="newDuration">
                          Duration
                        </label>
                        <input
                          id="newDuration"
                          value={newTaskDuration}
                          onChange={(e) => setNewTaskDuration(e.target.value)}
                          className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="submit"
                          className="inline-flex h-9 items-center justify-center rounded bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700 focus:outline-none focus-visible:outline-none"
                        >
                          Submit
                        </button>

                        <button
                          type="button"
                          onClick={() => setTasksOffice(null)}
                          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                        >
                          Close
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {isTasksModalOpen && editTask ? (
            <div
              className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4"
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => {
                if (e.currentTarget === e.target) {
                  setEditTask(null)
                }
              }}
            >
              <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">Edit Task</div>
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-slate-700" htmlFor="editTaskName">
                      Task
                    </label>
                    <input
                      id="editTaskName"
                      value={editTaskName}
                      onChange={(e) => setEditTaskName(e.target.value)}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-slate-700" htmlFor="editTaskDuration">
                      Duration
                    </label>
                    <input
                      id="editTaskDuration"
                      value={editTaskDuration}
                      onChange={(e) => setEditTaskDuration(e.target.value)}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setEditTask(null)}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={loading || !editTaskName.trim() || !editTaskDuration.trim()}
                    onClick={submitEditTask}
                    className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:outline-none"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : tab === "procurement-users" ? (
        <ProcurementUsersPage />
      ) : tab === "end-users" ? (
        <EndUsersPage />
      ) : tab === "departments" ? (
        <DepartmentsList />
      ) : (
        <SourceOfFundsList />
      )}
    </div>
  )
}
