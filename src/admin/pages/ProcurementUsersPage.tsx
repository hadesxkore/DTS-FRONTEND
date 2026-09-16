import { useEffect, useMemo, useState } from "react"
import { toast } from "../../lib/toast"

type UserType = "staff" | "viewer"

type UserStatus = "active" | "archived"

type ProcurementUserRow = {
  id: string
  office: string
  fullName: string
  username: string
  dateCreated: string
  type: UserType
  status: UserStatus
}

const RAW_API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api"
const API_URL = RAW_API_URL.replace(/\/$/, "").endsWith("/api")
  ? RAW_API_URL.replace(/\/$/, "")
  : `${RAW_API_URL.replace(/\/$/, "")}/api`

type ProcurementUsersPageProps = {
  title?: string
  subtitle?: string
}

type NewUserFormModel = {
  username: string
  type: UserType
  firstName: string
  middleName: string
  lastName: string
  password: string
  confirmPassword: string
}

const typeBadgeClass: Record<UserType, string> = {
  staff: "bg-sky-600 text-white",
  viewer: "bg-indigo-600 text-white",
}

const statusBadgeClass: Record<UserStatus, string> = {
  active: "bg-emerald-600 text-white",
  archived: "bg-rose-600 text-white",
}

export default function ProcurementUsersPage({ title = "Users" }: ProcurementUsersPageProps) {
  const [office, setOffice] = useState("")
  const [officeOptions, setOfficeOptions] = useState<string[]>([])
  const [rows, setRows] = useState<ProcurementUserRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState("")
  const [pageSize, setPageSize] = useState(10)

  const [isNewUserOpen, setIsNewUserOpen] = useState(false)
  const [resetPasswordUser, setResetPasswordUser] = useState<ProcurementUserRow | null>(null)
  const [moveOfficeUser, setMoveOfficeUser] = useState<ProcurementUserRow | null>(null)
  const [moveOfficeTarget, setMoveOfficeTarget] = useState("")
  const [moveOfficeError, setMoveOfficeError] = useState<string | null>(null)
  const [moveOfficeBusy, setMoveOfficeBusy] = useState(false)

  const [newUser, setNewUser] = useState<NewUserFormModel>({
    username: "",
    type: "staff",
    firstName: "",
    middleName: "",
    lastName: "",
    password: "",
    confirmPassword: "",
  })

  const [newUserError, setNewUserError] = useState<string | null>(null)

  const officeFiltered = useMemo(() => {
    if (!office) return []
    return rows
  }, [office, rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return officeFiltered
    return officeFiltered.filter((r) => {
      return (
        String(r.id).includes(q) ||
        r.fullName.toLowerCase().includes(q) ||
        r.username.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
      )
    })
  }, [officeFiltered, query])

  const visible = useMemo(() => filtered.slice(0, pageSize), [filtered, pageSize])

  function resetNewUserForm() {
    setNewUser({
      username: "",
      type: "staff",
      firstName: "",
      middleName: "",
      lastName: "",
      password: "",
      confirmPassword: "",
    })
    setNewUserError(null)
  }

  // Load offices for the dropdown so Procurement Users is always connected
  // to the current Offices list (admin side).
  useEffect(() => {
    ;(async () => {
      try {
        const token = localStorage.getItem("token")
        const response = await fetch(`${API_URL}/offices`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) return

        const data = await response.json().catch(() => null)
        const offices: string[] = Array.isArray(data?.offices)
          ? data.offices
              .filter((o: any) => o && typeof o.name === "string")
              .map((o: any) => String(o.name || "").trim())
              .filter((n: string) => n)
          : []

        // Ensure unique, sorted list
        const uniqueSorted = Array.from(new Set(offices)).sort((a, b) => a.localeCompare(b))
        setOfficeOptions(uniqueSorted)
      } catch {
        // ignore; dropdown will just be empty if offices cannot be loaded
      }
    })()
  }, [])

  function toggleArchive(user: ProcurementUserRow) {
    ;(async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await fetch(`${API_URL}/procurementusers/${user.id}/toggle-status`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })

        if (!response.ok) throw new Error('Failed to update status')
        await fetchUsers(office)
        toast.success('User status updated successfully.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update status')
      }
    })()
  }

  async function fetchUsers(selectedOffice: string) {
    if (!selectedOffice) return
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/procurementusers?office=${encodeURIComponent(selectedOffice)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch users')
      }

      const data = await response.json()
      const mappedUsers = data.users.map((u: any) => ({
        id: u._id,
        office: u.office,
        fullName: u.fullName,
        username: u.username,
        dateCreated: new Date(u.createdAt).toLocaleString(undefined, {
          year: "numeric",
          month: "long",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
        type: u.type,
        status: u.status,
      }))
      setRows(mappedUsers)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!office) {
      setRows([])
      setError(null)
      setLoading(false)
      return
    }
    fetchUsers(office)
  }, [office])

  function submitNewUser(e: React.FormEvent) {
    e.preventDefault()

    const officeValue = office.trim()
    const firstName = newUser.firstName.trim()
    const middleName = newUser.middleName.trim()
    const lastName = newUser.lastName.trim()
    const username = newUser.username.trim()
    const password = newUser.password
    const confirmPassword = newUser.confirmPassword

    if (!officeValue) {
      setNewUserError("Please select an office first.")
      return
    }

    if (!firstName || !lastName || !username || !password || !confirmPassword) {
      setNewUserError("Please fill out all required fields.")
      return
    }

    if (password !== confirmPassword) {
      setNewUserError("Password and Confirm Password do not match.")
      return
    }

    setNewUserError(null)

    ;(async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await fetch(`${API_URL}/procurementusers`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            office: officeValue,
            firstName,
            middleName,
            lastName,
            username,
            password,
            type: newUser.type,
          })
        })

        const raw = await response.text()
        let data: any = null
        try {
          data = raw ? JSON.parse(raw) : null
        } catch {
          data = null
        }

        if (!response.ok) {
          setNewUserError(data?.message || raw || 'Failed to create user')
          return
        }

        setIsNewUserOpen(false)
        resetNewUserForm()
        await fetchUsers(officeValue)
        toast.success('User added successfully.')
      } catch (err) {
        setNewUserError(err instanceof Error ? err.message : 'Failed to create user')
        toast.error(err instanceof Error ? err.message : 'Failed to create user')
      }
    })()
  }

  async function resetPassword(user: ProcurementUserRow) {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/procurementusers/${user.id}/reset-password`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      const raw = await response.text().catch(() => '')
      let data: any = null
      try {
        data = raw ? JSON.parse(raw) : null
      } catch {
        data = null
      }

      if (!response.ok) {
        throw new Error(data?.message || raw || 'Failed to reset password')
      }

      toast.success(`Password reset successfully! Default password: ${String(data?.defaultPassword || 'p@ssw0rd')}`)
      setResetPasswordUser(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset password')
    }
  }

  const isNewUserModalOpen = isNewUserOpen
  const isResetPasswordModalOpen = resetPasswordUser !== null
  const isMoveOfficeModalOpen = moveOfficeUser !== null

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-base font-semibold tracking-tight text-slate-900">{title}</div>
          <div className="text-sm text-slate-600">Manage procurement users per office</div>
        </div>

        <button
          type="button"
          className={`inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-semibold shadow-sm transition focus:outline-none focus-visible:outline-none ${
            office ? "bg-sky-600 text-white hover:bg-sky-700" : "cursor-not-allowed bg-slate-200 text-slate-500"
          }`}
          onClick={() => {
            if (!office) return
            resetNewUserForm()
            setIsNewUserOpen(true)
          }}
          title={office ? "Create a new user" : "Select an office first"}
        >
          New User
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Please select an Office</div>
        <div className="mt-3">
          <select
            aria-label="Office"
            title="Office"
            value={office}
            onChange={(e) => {
              const next = e.target.value
              setOffice(next)
              setQuery("")
              setPageSize(10)
            }}
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
          >
            <option value="">-- Please Select --</option>
            {officeOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">User List</div>
            <div className="text-xs text-slate-600">{office ? `Office: ${office}` : "Select an office to view users"}</div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600" htmlFor="entries">
                Show
              </label>
              <select
                id="entries"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                disabled={!office}
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
              <label className="text-sm text-slate-600" htmlFor="search">
                Search:
              </label>
              <input
                id="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9 w-full min-w-56 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                placeholder="id, name, username..."
                disabled={!office}
              />
            </div>
          </div>
        </div>

        <div className="overflow-auto">
          {error ? (
            <div className="p-4 text-center text-sm text-rose-600">Error: {error}</div>
          ) : loading ? (
            <div className="p-4 text-center text-sm text-slate-600">Loading users...</div>
          ) : (
            <table className="w-full min-w-[900px] text-center text-sm border-collapse border border-slate-200 [&_th]:border [&_th]:border-blue-700 [&_td]:border [&_td]:border-slate-200">
              <thead className="bg-blue-600 text-white">
                <tr>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">Full Name</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">Username</th>
                  <th className="hidden md:table-cell px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">Date Created</th>
                  <th className="hidden md:table-cell px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">Type</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {office ? (
                  visible.length > 0 ? (
                    visible.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 align-middle text-center font-medium text-slate-900">{r.fullName}</td>
                        <td className="px-4 py-3 align-middle text-center text-slate-700">{r.username}</td>
                        <td className="hidden md:table-cell px-4 py-3 align-middle text-center text-slate-700">{r.dateCreated}</td>
                        <td className="hidden md:table-cell px-4 py-3 align-middle text-center">
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
                          <div className="flex flex-wrap items-center justify-center gap-1.5 min-w-[200px]">
                            <button
                              type="button"
                              className={`inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-semibold text-white transition focus:outline-none focus-visible:outline-none ${
                                r.status === "active"
                                  ? "bg-rose-600 hover:bg-rose-700"
                                  : "bg-emerald-600 hover:bg-emerald-700"
                              }`}
                              onClick={() => toggleArchive(r)}
                            >
                              {r.status === "active" ? "Archive" : "Activate"}
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-8 items-center justify-center rounded-md bg-amber-400 px-3 text-xs font-semibold text-slate-900 transition hover:bg-amber-300 focus:outline-none focus-visible:outline-none"
                              onClick={() => setResetPasswordUser(r)}
                            >
                              Reset Password
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                              onClick={() => {
                                setMoveOfficeUser(r)
                                setMoveOfficeTarget("")
                                setMoveOfficeError(null)
                                setMoveOfficeBusy(false)
                              }}
                            >
                              Move Office
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-10 text-center text-sm text-slate-600" colSpan={6}>
                        No results.
                      </td>
                    </tr>
                  )
                ) : (
                  <tr>
                    <td className="px-4 py-10 text-center text-sm text-slate-600" colSpan={6}>
                      Select an office to view users.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isNewUserModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) {
              setIsNewUserOpen(false)
            }
          }}
        >
          <div className="flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">New User for {office}</div>
              </div>
            </div>

            <form onSubmit={submitNewUser} className="flex-1 space-y-4 overflow-auto p-4">
              {newUserError ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {newUserError}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="nuFirstName">
                    First Name
                  </label>
                  <input
                    id="nuFirstName"
                    value={newUser.firstName}
                    onChange={(e) => setNewUser((p) => ({ ...p, firstName: e.target.value }))}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="nuMiddleName">
                    Middle Name
                  </label>
                  <input
                    id="nuMiddleName"
                    value={newUser.middleName}
                    onChange={(e) => setNewUser((p) => ({ ...p, middleName: e.target.value }))}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="nuLastName">
                    Last Name
                  </label>
                  <input
                    id="nuLastName"
                    value={newUser.lastName}
                    onChange={(e) => setNewUser((p) => ({ ...p, lastName: e.target.value }))}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="nuType">
                    Type
                  </label>
                  <select
                    id="nuType"
                    value={newUser.type}
                    onChange={(e) => setNewUser((p) => ({ ...p, type: e.target.value as UserType }))}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  >
                    <option value="staff">Staff</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="nuUsername">
                    Username
                  </label>
                  <input
                    id="nuUsername"
                    value={newUser.username}
                    onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))}
                    className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="nuPassword">
                    Password
                  </label>
                  <input
                    id="nuPassword"
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                    className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="nuConfirmPassword">
                    Confirm Password
                  </label>
                  <input
                    id="nuConfirmPassword"
                    type="password"
                    value={newUser.confirmPassword}
                    onChange={(e) => setNewUser((p) => ({ ...p, confirmPassword: e.target.value }))}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  />
                </div>
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
                  onClick={() => setIsNewUserOpen(false)}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                >
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isResetPasswordModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) {
              setResetPasswordUser(null)
            }
          }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-end px-4 pt-4">
            </div>

            <div className="space-y-3 px-6 pb-6 text-center">
              <div className="mx-auto grid size-16 place-items-center rounded-full border-2 border-amber-300 text-amber-500">
                <span className="text-3xl font-bold">!</span>
              </div>
              <div className="text-2xl font-semibold tracking-tight text-slate-900">Are you sure?</div>
              <div className="text-sm text-slate-600">
                The account password will be change to <span className="font-semibold text-slate-900">p@ssw0rd</span>
              </div>

              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-md bg-sky-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus:outline-none focus-visible:outline-none"
                  onClick={() => {
                    if (!resetPasswordUser) return
                    resetPassword(resetPasswordUser)
                  }}
                >
                  Yes, Sure!
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-md bg-rose-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 focus:outline-none focus-visible:outline-none"
                  onClick={() => setResetPasswordUser(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isMoveOfficeModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) {
              setMoveOfficeUser(null)
            }
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">Move Office</div>
                <div className="truncate text-xs text-slate-600">{moveOfficeUser?.fullName}</div>
              </div>
            </div>

            <div className="space-y-3 p-4">
              {moveOfficeError ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {moveOfficeError}
                </div>
              ) : null}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="moveOfficeTarget">
                  Target Office
                </label>
                <select
                  id="moveOfficeTarget"
                  value={moveOfficeTarget}
                  onChange={(e) => setMoveOfficeTarget(e.target.value)}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                >
                  <option value="">-- Please Select --</option>
                  {officeOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  className={`inline-flex h-10 items-center justify-center rounded-md px-6 text-sm font-semibold text-white shadow-sm transition focus:outline-none focus-visible:outline-none ${
                    moveOfficeBusy || !moveOfficeTarget
                      ? "cursor-not-allowed bg-slate-300"
                      : "bg-sky-600 hover:bg-sky-700"
                  }`}
                  disabled={moveOfficeBusy || !moveOfficeTarget}
                  onClick={() => {
                    if (!moveOfficeUser) return
                    if (!moveOfficeTarget) return
                    setMoveOfficeBusy(true)
                    setMoveOfficeError(null)
                    ;(async () => {
                      try {
                        const token = localStorage.getItem('token')
                        const response = await fetch(`${API_URL}/procurementusers/${moveOfficeUser.id}`, {
                          method: 'PATCH',
                          headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({ office: moveOfficeTarget })
                        })

                        const raw = await response.text()
                        let data: any = null
                        try {
                          data = raw ? JSON.parse(raw) : null
                        } catch {
                          data = null
                        }

                        if (!response.ok) {
                          setMoveOfficeError(data?.message || raw || 'Failed to move user')
                          return
                        }

                        setMoveOfficeUser(null)
                        if (office) {
                          await fetchUsers(office)
                        }
                        toast.success('User moved successfully.')
                      } catch (err) {
                        setMoveOfficeError(err instanceof Error ? err.message : 'Failed to move user')
                        toast.error(err instanceof Error ? err.message : 'Failed to move user')
                      } finally {
                        setMoveOfficeBusy(false)
                      }
                    })()
                  }}
                >
                  Move
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                  onClick={() => setMoveOfficeUser(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  )
}
