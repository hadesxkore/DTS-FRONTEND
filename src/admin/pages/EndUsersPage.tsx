import { useEffect, useMemo, useState } from "react"
import { toast } from "../../lib/toast"

type UserStatus = "active" | "archived"

type EndUserRow = {
  id: string
  office: string
  fullName: string
  username: string
  firstName: string
  middleName: string
  lastName: string
  dateCreated: string
  status: UserStatus
}

type EndUserEditModel = {
  office: string
  status: UserStatus
  firstName: string
  middleName: string
  lastName: string
  username: string
}

const RAW_API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api"
const API_URL = RAW_API_URL.replace(/\/$/, "").endsWith("/api")
  ? RAW_API_URL.replace(/\/$/, "")
  : `${RAW_API_URL.replace(/\/$/, "")}/api`

type EndUsersPageProps = {
  title?: string
  subtitle?: string
}

type NewUserFormModel = {
  office: string
  username: string
  firstName: string
  middleName: string
  lastName: string
  password: string
  confirmPassword: string
}

const statusBadgeClass: Record<UserStatus, string> = {
  active: "bg-emerald-600 text-white",
  archived: "bg-rose-600 text-white",
}

export default function EndUsersPage({ title = "End Users" }: EndUsersPageProps) {
  const [office, setOffice] = useState("")
  const [officeOptions, setOfficeOptions] = useState<string[]>([])
  const [rows, setRows] = useState<EndUserRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [pageSize, setPageSize] = useState(10)

  const [isNewUserOpen, setIsNewUserOpen] = useState(false)
  const [resetPasswordUser, setResetPasswordUser] = useState<EndUserRow | null>(null)
  const [editUserRow, setEditUserRow] = useState<EndUserRow | null>(null)
  const [editUser, setEditUser] = useState<EndUserEditModel | null>(null)
  const [editUserError, setEditUserError] = useState<string | null>(null)

  const [newUser, setNewUser] = useState<NewUserFormModel>({
    office: "",
    username: "",
    firstName: "",
    middleName: "",
    lastName: "",
    password: "",
    confirmPassword: "",
  })

  const [newUserError, setNewUserError] = useState<string | null>(null)

  const officeFiltered = useMemo(() => {
    if (!office) return []
    return rows.filter((r) => String(r.office || "").trim() === office)
  }, [office, rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return officeFiltered
    return officeFiltered.filter((r) => {
      return (
        String(r.id).includes(q) ||
        r.fullName.toLowerCase().includes(q) ||
        r.username.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
      )
    })
  }, [officeFiltered, query])

  const visible = useMemo(() => filtered.slice(0, pageSize), [filtered, pageSize])

  function resetNewUserForm() {
    setNewUser({
      office: "",
      username: "",
      firstName: "",
      middleName: "",
      lastName: "",
      password: "",
      confirmPassword: "",
    })
    setNewUserError(null)
  }

  // Load departments for the dropdown so End Users is always connected
  // to the current Department List (admin side).
  useEffect(() => {
    ;(async () => {
      try {
        const token = localStorage.getItem("token")
        const response = await fetch(`${API_URL}/departments`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) return

        const data = await response.json().catch(() => null)
        const departments: string[] = Array.isArray(data?.departments)
          ? data.departments
              .filter((d: any) => d && typeof d.name === "string")
              .map((d: any) => String(d.name || "").trim())
              .filter((n: string) => n)
          : []

        const uniqueSorted = Array.from(new Set(departments)).sort((a, b) => a.localeCompare(b))
        setOfficeOptions(uniqueSorted)
      } catch {
        // ignore
      }
    })()
  }, [])

  // Fetch users from API
  useEffect(() => {
    fetchUsers()
  }, [])

  async function fetchUsers() {
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/endusers`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch users')
      }

      const data = await response.json()
      // Map backend data to frontend format
      const mappedUsers = data.users.map((u: any) => ({
        id: u._id,
        office: u.office,
        fullName: u.fullName,
        username: u.username,
        firstName: u.firstName,
        middleName: u.middleName,
        lastName: u.lastName,
        dateCreated: new Date(u.createdAt).toLocaleString(undefined, {
          year: "numeric",
          month: "long",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
        status: u.status,
      }))
      setRows(mappedUsers)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  async function toggleArchive(user: EndUserRow) {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/endusers/${user.id}/toggle-status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to update status')
      }

      // Refresh the user list
      await fetchUsers()
      toast.success('User status updated successfully.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  async function submitNewUser(e: React.FormEvent) {
    e.preventDefault()

    const officeValue = newUser.office.trim()
    const firstName = newUser.firstName.trim()
    const middleName = newUser.middleName.trim()
    const lastName = newUser.lastName.trim()
    const username = newUser.username.trim()
    const password = newUser.password
    const confirmPassword = newUser.confirmPassword

    if (!officeValue || !firstName || !lastName || !username || !password || !confirmPassword) {
      setNewUserError("Please fill out all required fields.")
      return
    }

    if (password !== confirmPassword) {
      setNewUserError("Password and Confirm Password do not match.")
      return
    }

    setNewUserError(null)

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/endusers`, {
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
        })
      })

      const data = await response.json()

      if (!response.ok) {
        setNewUserError(data.message || 'Failed to create user')
        return
      }

      // Refresh the user list
      await fetchUsers()
      setIsNewUserOpen(false)
      resetNewUserForm()
      toast.success('User added successfully.')
    } catch (err) {
      setNewUserError(err instanceof Error ? err.message : 'Failed to create user')
      toast.error(err instanceof Error ? err.message : 'Failed to create user')
    }
  }

  const isNewUserModalOpen = isNewUserOpen
  const isResetPasswordModalOpen = resetPasswordUser !== null
  const isEditUserModalOpen = editUserRow !== null && editUser !== null

  async function submitEditUser(e: React.FormEvent) {
    e.preventDefault()
    if (!editUserRow || !editUser) return

    const officeValue = editUser.office.trim()
    const firstName = editUser.firstName.trim()
    const middleName = editUser.middleName.trim()
    const lastName = editUser.lastName.trim()
    const username = editUser.username.trim()
    const status = editUser.status

    if (!officeValue || !firstName || !lastName || !username) {
      setEditUserError("Please fill out all required fields.")
      return
    }

    setEditUserError(null)

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/endusers/${editUserRow.id}`, {
        method: 'PATCH',
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
          status,
        })
      })

      const data = await response.json()

      if (!response.ok) {
        setEditUserError(data.message || 'Failed to update user')
        return
      }

      await fetchUsers()
      setEditUserRow(null)
      setEditUser(null)
      toast.success('User updated successfully.')
    } catch (err) {
      setEditUserError(err instanceof Error ? err.message : 'Failed to update user')
      toast.error(err instanceof Error ? err.message : 'Failed to update user')
    }
  }

  async function resetPassword(user: EndUserRow) {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/endusers/${user.id}/reset-password`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to reset password')
      }

      const data = await response.json()
      toast.success(`Password reset successfully! Default password: ${data.defaultPassword}`)
      setResetPasswordUser(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset password')
    }
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 ring-1 ring-inset ring-blue-700/10">
              The Bunker &bull; Bataan Capitol DTS
            </span>
          </div>
          <div className="mt-1 text-lg font-bold tracking-tight text-slate-900">{title}</div>
          <div className="text-xs text-slate-500">Provincial office department staff and end-user directory</div>
        </div>

        <button
          type="button"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-700 focus:outline-none focus-visible:outline-none"
          onClick={() => {
            resetNewUserForm()
            setIsNewUserOpen(true)
          }}
        >
          + New End User
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-600">Select Provincial Office Filter</div>
        <div className="mt-2">
          <select
            aria-label="Office"
            title="Office"
            value={office}
            onChange={(e) => setOffice(e.target.value)}
            className="h-9.5 w-full rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-slate-50/80 px-3 text-xs font-semibold text-slate-800 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">-- All Provincial Offices --</option>
            {officeOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      </div>

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
              placeholder="ID, name, username..."
            />
          </div>
        </div>

        <div className="overflow-auto">
          {error ? (
            <div className="p-4 text-center text-sm text-rose-600">
              Error: {error}
            </div>
          ) : loading && office ? (
            <div className="p-4 text-center text-sm text-slate-600">
              Loading users...
            </div>
          ) : (
          <table className="w-full min-w-[900px] text-center text-sm border-collapse border border-slate-200 [&_th]:border [&_th]:border-blue-700 [&_td]:border [&_td]:border-slate-200">
            <thead className="bg-blue-600 text-white border-b border-blue-700">
              <tr>
                <th className="hidden md:table-cell px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-white">Office</th>
                <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-white">Full Name</th>
                <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-white">Username</th>
                <th className="hidden md:table-cell px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-white">Date Created</th>
                <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-white">Status</th>
                <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-white">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {office ? (
                visible.length > 0 ? (
                  visible.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="hidden md:table-cell px-4 py-3 align-middle text-center text-slate-700">{r.office}</td>
                      <td className="px-4 py-3 align-middle text-center font-medium text-slate-900">{r.fullName}</td>
                      <td className="px-4 py-3 align-middle text-center text-slate-700">{r.username}</td>
                      <td className="hidden md:table-cell px-4 py-3 align-middle text-center text-slate-700">{r.dateCreated}</td>
                      <td className="px-4 py-3 align-middle text-center">
                        <span className={`inline-flex h-6 items-center rounded px-2 text-[11px] font-semibold ${statusBadgeClass[r.status]}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle text-center">
                        <div className="flex flex-wrap items-center justify-center gap-1.5 min-w-[200px]">
                          <button
                            type="button"
                            className="inline-flex h-8 items-center justify-center rounded-md bg-sky-600 px-3 text-xs font-semibold text-white transition hover:bg-sky-700 focus:outline-none focus-visible:outline-none"
                            onClick={() => {
                              setEditUserRow(r)
                              setEditUser({
                                office: r.office,
                                status: r.status,
                                firstName: r.firstName || "",
                                middleName: r.middleName || "",
                                lastName: r.lastName || "",
                                username: r.username,
                              })
                              setEditUserError(null)
                            }}
                          >
                            Edit
                          </button>
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
                <div className="truncate text-sm font-semibold text-slate-900">New End User</div>
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
                  <label className="text-xs font-semibold text-slate-700" htmlFor="euFirstName">
                    First Name
                  </label>
                  <input
                    id="euFirstName"
                    value={newUser.firstName}
                    onChange={(e) => setNewUser((p) => ({ ...p, firstName: e.target.value }))}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="euMiddleName">
                    Middle Name
                  </label>
                  <input
                    id="euMiddleName"
                    value={newUser.middleName}
                    onChange={(e) => setNewUser((p) => ({ ...p, middleName: e.target.value }))}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="euLastName">
                    Last Name
                  </label>
                  <input
                    id="euLastName"
                    value={newUser.lastName}
                    onChange={(e) => setNewUser((p) => ({ ...p, lastName: e.target.value }))}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="euOffice">
                    Office
                  </label>
                  <select
                    id="euOffice"
                    value={newUser.office}
                    onChange={(e) => setNewUser((p) => ({ ...p, office: e.target.value }))}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  >
                    <option value="">Please select an office</option>
                    {officeOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="euUsername">
                    Username
                  </label>
                  <input
                    id="euUsername"
                    value={newUser.username}
                    onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))}
                    className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="euPassword">
                    Password
                  </label>
                  <input
                    id="euPassword"
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                    className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="euConfirmPassword">
                    Confirm Password
                  </label>
                  <input
                    id="euConfirmPassword"
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
                  onClick={() => resetPasswordUser && resetPassword(resetPasswordUser)}
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

      {isEditUserModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) {
              setEditUserRow(null)
              setEditUser(null)
            }
          }}
        >
          <div className="flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">Edit End User</div>
              </div>
            </div>

            <form onSubmit={submitEditUser} className="flex-1 space-y-4 overflow-auto p-4">
              {editUserError ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {editUserError}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="euEditFirstName">
                    First Name
                  </label>
                  <input
                    id="euEditFirstName"
                    value={editUser?.firstName || ""}
                    onChange={(e) => setEditUser((p) => (p ? { ...p, firstName: e.target.value } : p))}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="euEditMiddleName">
                    Middle Name
                  </label>
                  <input
                    id="euEditMiddleName"
                    value={editUser?.middleName || ""}
                    onChange={(e) => setEditUser((p) => (p ? { ...p, middleName: e.target.value } : p))}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="euEditLastName">
                    Last Name
                  </label>
                  <input
                    id="euEditLastName"
                    value={editUser?.lastName || ""}
                    onChange={(e) => setEditUser((p) => (p ? { ...p, lastName: e.target.value } : p))}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="euEditOffice">
                    Office
                  </label>
                  <select
                    id="euEditOffice"
                    value={editUser?.office || ""}
                    onChange={(e) => setEditUser((p) => (p ? { ...p, office: e.target.value } : p))}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  >
                    <option value="">Please select an office</option>
                    {officeOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="euEditUsername">
                    Username
                  </label>
                  <input
                    id="euEditUsername"
                    value={editUser?.username || ""}
                    onChange={(e) => setEditUser((p) => (p ? { ...p, username: e.target.value } : p))}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="euEditStatus">
                    Status
                  </label>
                  <select
                    id="euEditStatus"
                    value={editUser?.status || "active"}
                    onChange={(e) => setEditUser((p) => (p ? { ...p, status: e.target.value as UserStatus } : p))}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  >
                    <option value="active">active</option>
                    <option value="archived">archived</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="submit"
                  className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:outline-none"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditUserRow(null)
                    setEditUser(null)
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

    </div>
  )
}
