import { useEffect, useMemo, useState } from "react"
import { Pencil, Trash2, Clock, Plus, Search, CheckCircle2 } from "lucide-react"
import { toast } from "../../lib/toast"

const RAW_API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api"
const API_URL = RAW_API_URL.replace(/\/$/, "").endsWith("/api")
  ? RAW_API_URL.replace(/\/$/, "")
  : `${RAW_API_URL.replace(/\/$/, "")}/api`

export const DEFAULT_TRANSFER_TASKS = [
  "For PR number",
  "For OBR signing",
  "For PR / OBR signing",
  "For PR signing / approval",
  "For canvassing / resolution signing",
  "For PO number",
  "For PO signing",
  "For supplier (signing) / inspection & delivery / voucher preparation / signing of end user",
  "For voucher signing",
  "For check preparation",
  "For signing of checks & voucher",
  "For counter signing of checks",
  "For check advice",
  "For releasing of checks",
]

type TaskStatus = "active" | "archived"

type TaskItem = {
  id: number
  task: string
  duration: string
  status: TaskStatus
  createdAt?: string
}

function parseDurationParts(durationStr: string): { value: string; unit: string } {
  const s = String(durationStr || "").trim().toLowerCase()
  if (!s) return { value: "1", unit: "hours" }
  const match = s.match(
    /^(\d+(?:\.\d+)?)\s*(day|days|hour|hours|hr|hrs|min|mins|minute|minutes|sec|secs|second|seconds)?$/
  )
  if (match) {
    const val = match[1]
    const u = match[2] || "hours"
    let normalizedUnit = "hours"
    if (u.startsWith("min")) normalizedUnit = "minutes"
    else if (u.startsWith("hour") || u === "hr" || u === "hrs") normalizedUnit = "hours"
    else if (u.startsWith("day")) normalizedUnit = "days"
    return { value: val, unit: normalizedUnit }
  }
  return { value: "1", unit: "hours" }
}

function formatDurationValue(value: string | number, unit: string): string {
  const num = parseFloat(String(value))
  if (isNaN(num) || num <= 0) return ""
  const cleanUnit = (unit || "hours").toLowerCase()
  if (cleanUnit.startsWith("min")) {
    return `${num} ${num === 1 ? "minute" : "minutes"}`
  }
  if (cleanUnit.startsWith("hour") || cleanUnit === "hr" || cleanUnit === "hrs") {
    return `${num} ${num === 1 ? "hour" : "hours"}`
  }
  if (cleanUnit.startsWith("day")) {
    return `${num} ${num === 1 ? "day" : "days"}`
  }
  return `${num} ${cleanUnit}`
}

export default function OfficeTasksList() {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters & Pagination
  const [query, setQuery] = useState("")
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("all")
  const [pageSize, setPageSize] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)

  // Modals
  const [isNewModalOpen, setIsNewModalOpen] = useState(false)
  const [editTaskItem, setEditTaskItem] = useState<TaskItem | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<TaskItem | null>(null)

  // Form State for Add
  const [newTaskName, setNewTaskName] = useState("")
  const [newTaskDurationValue, setNewTaskDurationValue] = useState("1")
  const [newTaskDurationUnit, setNewTaskDurationUnit] = useState("hours")

  // Form State for Edit
  const [editTaskName, setEditTaskName] = useState("")
  const [editTaskDurationValue, setEditTaskDurationValue] = useState("1")
  const [editTaskDurationUnit, setEditTaskDurationUnit] = useState("hours")

  async function fetchTasks() {
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem("token")
      const response = await fetch(`${API_URL}/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || "Failed to fetch tasks")
      }

      const data = await response.json()
      const taskList: TaskItem[] = (data.tasks || []).map((t: any) => ({
        id: Number(t.taskId || t.id),
        task: String(t.task || ""),
        duration: String(t.duration || "1 hour"),
        status: t.status === "archived" ? "archived" : "active",
        createdAt: t.createdAt,
      }))

      setTasks(taskList)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch tasks")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTasks()
  }, [])

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tasks.filter((item) => {
      // Status filter
      if (selectedStatusFilter !== "all" && item.status !== selectedStatusFilter) {
        return false
      }
      // Search query
      if (q) {
        const matchTask = item.task.toLowerCase().includes(q)
        const matchDuration = item.duration.toLowerCase().includes(q)
        const matchId = String(item.id).includes(q)
        if (!matchTask && !matchDuration && !matchId) return false
      }
      return true
    })
  }, [tasks, query, selectedStatusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / pageSize))

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1)
    }
  }, [totalPages, currentPage])

  const visibleTasks = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredTasks.slice(start, start + pageSize)
  }, [filteredTasks, currentPage, pageSize])

  function resetNewForm() {
    setNewTaskName("")
    setNewTaskDurationValue("1")
    setNewTaskDurationUnit("hours")
  }

  function openNewTaskModal() {
    resetNewForm()
    setIsNewModalOpen(true)
  }

  function openEditModal(item: TaskItem) {
    setEditTaskItem(item)
    setEditTaskName(item.task)
    const parts = parseDurationParts(item.duration)
    setEditTaskDurationValue(parts.value)
    setEditTaskDurationUnit(parts.unit)
  }

  async function submitNewTask(e: React.FormEvent) {
    e.preventDefault()
    const taskName = newTaskName.trim()
    const duration = formatDurationValue(newTaskDurationValue, newTaskDurationUnit)

    if (!taskName || !duration) {
      toast.error("Please fill in all required fields.")
      return
    }

    try {
      setLoading(true)
      const token = localStorage.getItem("token")
      const response = await fetch(`${API_URL}/tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ task: taskName, duration }),
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || "Failed to create task")
      }

      toast.success("Task created successfully.")
      setIsNewModalOpen(false)
      resetNewForm()
      await fetchTasks()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create task")
    } finally {
      setLoading(false)
    }
  }

  async function submitEditTask(e: React.FormEvent) {
    e.preventDefault()
    if (!editTaskItem) return

    const taskName = editTaskName.trim()
    const duration = formatDurationValue(editTaskDurationValue, editTaskDurationUnit)

    if (!taskName || !duration) {
      toast.error("Please fill in all required fields.")
      return
    }

    try {
      setLoading(true)
      const token = localStorage.getItem("token")
      const response = await fetch(`${API_URL}/tasks/${editTaskItem.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ task: taskName, duration }),
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || "Failed to update task")
      }

      toast.success("Task updated successfully.")
      setEditTaskItem(null)
      await fetchTasks()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update task")
    } finally {
      setLoading(false)
    }
  }

  async function toggleStatus(item: TaskItem) {
    const nextStatus: TaskStatus = item.status === "active" ? "archived" : "active"
    try {
      setLoading(true)
      const token = localStorage.getItem("token")
      const response = await fetch(`${API_URL}/tasks/${item.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || "Failed to update task status")
      }

      toast.success(
        `Task ${nextStatus === "active" ? "activated" : "archived"} successfully.`
      )
      await fetchTasks()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update status")
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteTask() {
    if (!deleteConfirm) return
    try {
      setLoading(true)
      const token = localStorage.getItem("token")
      const response = await fetch(`${API_URL}/tasks/${deleteConfirm.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || "Failed to delete task")
      }

      toast.success("Task deleted successfully.")
      setDeleteConfirm(null)
      await fetchTasks()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete task")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-base font-semibold tracking-tight text-slate-900">
            Tasks
          </div>
          <div className="text-sm text-slate-600">
            Manage workflow tasks, remarks, and standard duration limits
          </div>
        </div>

        <button
          type="button"
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none"
          onClick={openNewTaskModal}
        >
          <Plus className="size-3.5" />
          New Task
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Filters Bar */}
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between bg-slate-50/50">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600" htmlFor="taskEntries">
                Show
              </label>
              <select
                id="taskEntries"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setCurrentPage(1)
                }}
                className="h-9 rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-white px-2.5 text-xs font-semibold text-slate-800 transition focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="text-xs font-semibold text-slate-600">entries</span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedStatusFilter}
                onChange={(e) => {
                  setSelectedStatusFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 transition focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              <input
                id="taskSearch"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setCurrentPage(1)
                }}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="Search task, duration..."
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto">
          {error ? (
            <div className="p-4 text-center text-sm text-rose-600">Error: {error}</div>
          ) : null}
          {loading && tasks.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-600">Loading tasks...</div>
          ) : null}
          <table className="w-full min-w-[700px] text-center text-sm border-collapse border border-slate-200 [&_th]:border [&_th]:border-blue-700 [&_td]:border [&_td]:border-slate-200">
            <thead className="bg-blue-600 text-white">
              <tr>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white w-16">
                  ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white">
                  Task / Remarks
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white w-40">
                  Standard Duration
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white w-28">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white w-64">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {visibleTasks.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 align-middle text-center font-medium text-slate-700">
                    {t.id}
                  </td>
                  <td className="px-4 py-3 align-middle text-left font-medium text-slate-800">
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-blue-500 shrink-0" />
                      {t.task}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle text-center font-medium text-slate-700 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 font-medium">
                      <Clock className="size-3 text-slate-500" />
                      {t.duration || "1 hour"}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle text-center">
                    <span
                      className={`inline-flex h-6 items-center rounded px-2 text-[11px] font-semibold ${
                        t.status === "active"
                          ? "bg-emerald-600 text-white"
                          : "bg-rose-600 text-white"
                      }`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle text-center">
                    <div className="flex flex-wrap items-center justify-center gap-1.5 min-w-[200px]">
                      <button
                        type="button"
                        onClick={() => openEditModal(t)}
                        className="inline-flex h-7 items-center justify-center rounded bg-blue-600 px-2.5 text-[11px] font-semibold text-white transition hover:bg-blue-700 focus:outline-none"
                      >
                        <Pencil className="size-3 mr-1" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStatus(t)}
                        className={`inline-flex h-7 items-center justify-center rounded px-2.5 text-[11px] font-semibold text-white transition focus:outline-none ${
                          t.status === "active"
                            ? "bg-amber-600 hover:bg-amber-700"
                            : "bg-emerald-600 hover:bg-emerald-700"
                        }`}
                      >
                        {t.status === "active" ? "Archive" : "Activate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(t)}
                        className="inline-flex h-7 items-center justify-center rounded bg-rose-600 px-2.5 text-[11px] font-semibold text-white transition hover:bg-rose-700 focus:outline-none"
                      >
                        <Trash2 className="size-3 mr-1" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {visibleTasks.length === 0 && !loading ? (
                <tr>
                  <td className="px-4 py-12 text-center text-sm text-slate-500" colSpan={5}>
                    No tasks found matching your criteria.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {filteredTasks.length > 0 ? (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-600">
            <div>
              Showing{" "}
              <span className="font-semibold text-slate-900">
                {(currentPage - 1) * pageSize + 1}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-slate-900">
                {Math.min(currentPage * pageSize, filteredTasks.length)}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-slate-900">{filteredTasks.length}</span>{" "}
              tasks
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="inline-flex h-8 items-center justify-center rounded border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(
                    (p) =>
                      p === 1 ||
                      p === totalPages ||
                      (p >= currentPage - 1 && p <= currentPage + 1)
                  )
                  .map((p, idx, arr) => {
                    const prevP = arr[idx - 1]
                    const showEllipsis = prevP && p - prevP > 1
                    return (
                      <div key={p} className="flex items-center">
                        {showEllipsis && <span className="px-1 text-slate-400">...</span>}
                        <button
                          type="button"
                          onClick={() => setCurrentPage(p)}
                          className={`inline-flex h-8 min-w-[32px] items-center justify-center rounded px-2 text-xs font-semibold transition ${
                            currentPage === p
                              ? "bg-blue-600 text-white shadow-sm"
                              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {p}
                        </button>
                      </div>
                    )
                  })}
              </div>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex h-8 items-center justify-center rounded border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Datalist for Transfer Task Suggestions */}
      <datalist id="transfer-tasks-suggestions">
        {DEFAULT_TRANSFER_TASKS.map((taskName, idx) => (
          <option key={idx} value={taskName} />
        ))}
      </datalist>

      {/* Add New Task Modal */}
      {isNewModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) {
              setIsNewModalOpen(false)
            }
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 bg-slate-50">
              <div className="text-sm font-semibold text-slate-900">Add New Task</div>
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={submitNewTask} className="space-y-4 p-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="newOfficeTaskName">
                    Task / Remarks <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-500">Pick standard task or type custom</span>
                </div>
                <input
                  id="newOfficeTaskName"
                  list="transfer-tasks-suggestions"
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  placeholder="e.g. For OBR signing"
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                />
              </div>

              {/* Quick Transfer Task Pills */}
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-slate-500">Quick Select Standard Tasks:</span>
                <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto p-1.5 border border-slate-100 rounded bg-slate-50">
                  {DEFAULT_TRANSFER_TASKS.map((t, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setNewTaskName(t)}
                      className={`text-[11px] px-2 py-0.5 rounded transition ${
                        newTaskName === t
                          ? "bg-blue-600 text-white font-medium"
                          : "bg-white border border-slate-200 text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="newTaskDuration">
                  Standard Duration Limit <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    id="newTaskDuration"
                    type="number"
                    min="1"
                    step="any"
                    placeholder="e.g. 1"
                    value={newTaskDurationValue}
                    onChange={(e) => setNewTaskDurationValue(e.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    required
                  />
                  <select
                    value={newTaskDurationUnit}
                    onChange={(e) => setNewTaskDurationUnit(e.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="minutes">Minute(s)</option>
                    <option value="hours">Hour(s)</option>
                    <option value="days">Day(s)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !newTaskName.trim()}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Edit Task Modal */}
      {editTaskItem ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) {
              setEditTaskItem(null)
            }
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 bg-slate-50">
              <div className="text-sm font-semibold text-slate-900">Edit Task</div>
              <button
                type="button"
                onClick={() => setEditTaskItem(null)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={submitEditTask} className="space-y-4 p-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="editTaskNameField">
                  Task / Remarks <span className="text-rose-500">*</span>
                </label>
                <input
                  id="editTaskNameField"
                  list="transfer-tasks-suggestions"
                  value={editTaskName}
                  onChange={(e) => setEditTaskName(e.target.value)}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="editDurationField">
                  Standard Duration Limit <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    id="editDurationField"
                    type="number"
                    min="1"
                    step="any"
                    placeholder="e.g. 1"
                    value={editTaskDurationValue}
                    onChange={(e) => setEditTaskDurationValue(e.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    required
                  />
                  <select
                    value={editTaskDurationUnit}
                    onChange={(e) => setEditTaskDurationUnit(e.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="minutes">Minute(s)</option>
                    <option value="hours">Hour(s)</option>
                    <option value="days">Day(s)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setEditTaskItem(null)}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !editTaskName.trim()}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  Save Changes
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
            <div className="border-b border-slate-200 px-4 py-3 bg-slate-50">
              <div className="text-sm font-semibold text-slate-900">Delete Task</div>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-slate-600">
                Are you sure you want to delete task{" "}
                <span className="font-semibold text-slate-900">"{deleteConfirm.task}"</span>?
              </p>
              <p className="text-xs text-rose-600">
                This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/50 px-4 py-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleDeleteTask}
                className="inline-flex h-9 items-center justify-center rounded-md bg-rose-600 px-4 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
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
