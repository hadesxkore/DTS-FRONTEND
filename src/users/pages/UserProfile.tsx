import { Building2, Key, Mail, User } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

const RAW_API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api"
const API_URL = RAW_API_URL.replace(/\/$/, "").endsWith("/api")
  ? RAW_API_URL.replace(/\/$/, "")
  : `${RAW_API_URL.replace(/\/$/, "")}/api`

type UserProfileProps = {
  user?: {
    username: string
    role: string
    office?: string
  }
}

export default function UserProfile({ user }: UserProfileProps) {
  type ProfileTab = "office_email" | "department_head" | "change_password"

  const [tab, setTab] = useState<ProfileTab>("change_password")
  const [officeEmail, setOfficeEmail] = useState("jcpayumo@bataan.gov.ph")
  const [contactNumber, setContactNumber] = useState("")
  const [deptHead, setDeptHead] = useState("DEODAR Q. DIMAUANAHAN, MD")
  const [deptHeadDesignation, setDeptHeadDesignation] = useState("OIC: Chief of Hospital")
  const [passwordForm, setPasswordForm] = useState({ oldPassword: "", newPassword: "", confirmPassword: "" })
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [currentOfficeId, setCurrentOfficeId] = useState<number | null>(null)

  const usernameKey = useMemo(() => {
    return user?.username ? user.username : "User"
  }, [user?.username])

  const createdByName = useMemo(() => {
    try {
      const raw = localStorage.getItem('user')
      const parsed = raw ? (JSON.parse(raw) as { fullName?: string; username?: string } | null) : null
      const fullName = String(parsed?.fullName || '').trim()
      if (fullName) return fullName
      const fallbackUsername = String(parsed?.username || '').trim()
      return fallbackUsername || usernameKey
    } catch {
      return usernameKey
    }
  }, [usernameKey])

  const settingsKey = useMemo(() => {
    return `user_profile_settings:${usernameKey}`
  }, [usernameKey])

  const currentOfficeName = useMemo(() => {
    const fromProp = String((user as any)?.office || '').trim()
    if (fromProp) return fromProp
    try {
      const raw = localStorage.getItem('user')
      if (!raw) return ''
      const parsed = JSON.parse(raw) as { office?: string } | null
      return String(parsed?.office || '').trim()
    } catch {
      return ''
    }
  }, [user])

  useEffect(() => {
    ;(async () => {
      // 1) Load from DB first
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(`${API_URL}/profile`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (res.ok) {
          const data = (await res.json()) as {
            profile?: {
              officeEmail?: string
              contactNumber?: string
              deptHead?: string
              deptHeadDesignation?: string
            }
          }

          const profile = data?.profile
          if (profile) {
            if (typeof profile.officeEmail === 'string') setOfficeEmail(profile.officeEmail)
            if (typeof profile.contactNumber === 'string') setContactNumber(profile.contactNumber)
            if (typeof profile.deptHead === 'string' && profile.deptHead.trim()) setDeptHead(profile.deptHead)
            if (typeof profile.deptHeadDesignation === 'string' && profile.deptHeadDesignation.trim())
              setDeptHeadDesignation(profile.deptHeadDesignation)

            try {
              localStorage.setItem(
                settingsKey,
                JSON.stringify({
                  officeEmail: typeof profile.officeEmail === 'string' ? profile.officeEmail : officeEmail,
                  contactNumber: typeof profile.contactNumber === 'string' ? profile.contactNumber : contactNumber,
                  deptHead: typeof profile.deptHead === 'string' ? profile.deptHead : deptHead,
                  deptHeadDesignation:
                    typeof profile.deptHeadDesignation === 'string'
                      ? profile.deptHeadDesignation
                      : deptHeadDesignation,
                })
              )
            } catch {
              // ignore
            }
            return
          }
        }
      } catch {
        // ignore
      }

      // 2) Fallback to localStorage
      try {
        const raw = localStorage.getItem(settingsKey)
        if (!raw) return
        const parsed = JSON.parse(raw) as {
          officeEmail?: string
          contactNumber?: string
          deptHead?: string
          deptHeadDesignation?: string
        }
        if (typeof parsed.officeEmail === "string") setOfficeEmail(parsed.officeEmail)
        if (typeof parsed.contactNumber === "string") setContactNumber(parsed.contactNumber)
        if (typeof parsed.deptHead === "string") setDeptHead(parsed.deptHead)
        if (typeof parsed.deptHeadDesignation === "string") setDeptHeadDesignation(parsed.deptHeadDesignation)
      } catch {
        // ignore
      }
    })()
  }, [settingsKey])

  useEffect(() => {
    if (!currentOfficeName) return

    ;(async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(`${API_URL}/offices`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!res.ok) return
        const data = (await res.json()) as {
          offices?: Array<{ officeId?: number; name?: string; head?: string; headDesignation?: string; email?: string }>
        }

        const match = (data.offices || []).find((o) => {
          const name = String(o?.name || '').trim().toLowerCase()
          return name && name === currentOfficeName.trim().toLowerCase()
        })

        if (!match) return
        const officeId = Number((match as any)?.officeId)
        if (Number.isFinite(officeId)) setCurrentOfficeId(officeId)
        const head = String(match.head || '').trim()
        const designation = String(match.headDesignation || '').trim()
        const email = String(match.email || '').trim()
        if (head) setDeptHead(head)
        if (designation) setDeptHeadDesignation(designation)
        if (email) setOfficeEmail(email)
      } catch {
        // ignore
      }
    })()
  }, [currentOfficeName])

  const patchOffice = async (body: { email?: string; head?: string; headDesignation?: string }) => {
    if (!currentOfficeId) throw new Error('Office not found for this user.')
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_URL}/offices/${currentOfficeId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const msg = await res.text().catch(() => '')
      throw new Error(msg || 'Failed to update office')
    }
  }

  useEffect(() => {
    if (!status) return
    const t = window.setTimeout(() => setStatus(null), 2500)
    return () => window.clearTimeout(t)
  }, [status])

  function tabClass(isActive: boolean) {
    return isActive
      ? "inline-flex h-8 items-center gap-2 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 transition"
      : "inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
  }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 ring-1 ring-inset ring-blue-700/10">
            The Bunker &bull; Bataan Capitol DTS
          </span>
        </div>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">User Profile & Account</h1>
        <p className="text-xs text-slate-500">Manage your office details, signatory information, and account security</p>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-blue-50 border border-blue-100 text-blue-600">
                <User className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-base font-bold text-slate-900">
                  {createdByName}
                </div>
                <div className="text-xs font-medium text-slate-500">
                  {user?.role === "staff" ? "Staff User" : user?.role === "procurement" ? "Procurement Officer" : "Office Representative"}
                  {currentOfficeName ? ` &bull; ${currentOfficeName}` : ""}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
              <Mail className="size-3.5 text-slate-400" />
              <span className="font-medium">{officeEmail || "No office email specified"}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={tabClass(tab === "office_email")} onClick={() => setTab("office_email")}
              title="Office Email">
              <Mail className="size-3.5" />
              Office Email
            </button>
            <button
              type="button"
              className={tabClass(tab === "department_head")}
              onClick={() => setTab("department_head")}
              title="Department Head"
            >
              <Building2 className="size-3.5" />
              Department Head
            </button>
            <button
              type="button"
              className={tabClass(tab === "change_password")}
              onClick={() => setTab("change_password")}
              title="Change Password"
            >
              <Key className="size-3.5" />
              Change Password
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {status ? (
          <div
            className={`rounded-xl border px-4 py-3 text-xs font-medium lg:col-span-3 ${
              status.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {status.message}
          </div>
        ) : null}

        {tab === "change_password" ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-3">
            <div className="mb-4 flex items-center gap-2.5">
              <div className="grid size-9 place-items-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                <Key className="size-4" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">Change Password</div>
                <div className="text-xs text-slate-500">Update your account password to maintain system security.</div>
              </div>
            </div>
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault()
                setStatus(null)
                if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
                  setStatus({ type: "error", message: "Please fill out all password fields." })
                  return
                }
                if (passwordForm.newPassword !== passwordForm.confirmPassword) return
                setStatus({ type: "success", message: "Password updated successfully." })
                setPasswordForm({ oldPassword: "", newPassword: "", confirmPassword: "" })
              }}
            >
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Old Password</label>
                <input
                  type="password"
                  value={passwordForm.oldPassword}
                  onChange={(e) => setPasswordForm((v) => ({ ...v, oldPassword: e.target.value }))}
                  aria-label="Old Password"
                  title="Old Password"
                  placeholder="Old Password"
                  className="h-9 w-full rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-slate-50/80 px-3 text-xs text-slate-900 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">New Password</label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm((v) => ({ ...v, newPassword: e.target.value }))}
                  aria-label="New Password"
                  title="New Password"
                  placeholder="New Password"
                  className="h-9 w-full rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-slate-50/80 px-3 text-xs text-slate-900 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Re-Enter New Password</label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm((v) => ({ ...v, confirmPassword: e.target.value }))}
                  aria-label="Re-Enter New Password"
                  title="Re-Enter New Password"
                  placeholder="Re-Enter New Password"
                  className="h-9 w-full rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-slate-50/80 px-3 text-xs text-slate-900 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                {passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword ? (
                  <div className="text-xs text-rose-600 font-medium">Passwords do not match.</div>
                ) : null}
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-700 focus:outline-none focus-visible:outline-none"
                >
                  Submit Changes
                </button>
              </div>
            </form>
          </div>
        ) : tab === "office_email" ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-3">
            <div className="mb-4 flex items-center gap-2.5">
              <div className="grid size-9 place-items-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                <Mail className="size-4" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">Office Email Address</div>
                <div className="text-xs text-slate-500">Set the email used for official notifications and office communications.</div>
              </div>
            </div>
            <form
              className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault()
                ;(async () => {
                  setStatus(null)
                  const emailValue = officeEmail.trim()
                  if (!emailValue) {
                    setStatus({ type: "error", message: "Please enter an email." })
                    return
                  }

                  try {
                    await patchOffice({ email: emailValue })

                    // Keep profile contact number update (user-specific)
                    const token = localStorage.getItem('token')
                    const res = await fetch(`${API_URL}/profile`, {
                      method: 'PATCH',
                      headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        officeEmail: emailValue,
                      }),
                    })

                    if (!res.ok) {
                      const msg = await res.text().catch(() => '')
                      throw new Error(msg || 'Failed to save')
                    }

                    try {
                      localStorage.setItem(
                        settingsKey,
                        JSON.stringify({
                          officeEmail: emailValue,
                          contactNumber,
                          deptHead,
                          deptHeadDesignation,
                        })
                      )
                    } catch {
                      // ignore
                    }

                    setOfficeEmail(emailValue)
                    setStatus({ type: "success", message: "Office email updated." })
                  } catch (err) {
                    setStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to save. Please try again." })
                  }
                })()
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Official Office Email</label>
                  <input
                    type="email"
                    value={officeEmail}
                    onChange={(e) => setOfficeEmail(e.target.value)}
                    aria-label="Office Email"
                    title="Office Email"
                    placeholder="office@domain.com"
                    className="h-9 w-full rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-slate-50/80 px-3 text-xs text-slate-900 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Account Username</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                      <User className="size-3.5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      value={createdByName}
                      disabled
                      aria-label="Created by"
                      title="Created by"
                      placeholder="-"
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-100 pl-8 pr-3 text-xs text-slate-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-end justify-end">
                <button
                  type="submit"
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-700 focus:outline-none focus-visible:outline-none"
                >
                  Update Email
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-3">
            <div className="mb-4 flex items-center gap-2.5">
              <div className="grid size-9 place-items-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                <Building2 className="size-4" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">Department Head & Signatory</div>
                <div className="text-xs text-slate-500">Maintain the signatory name and designation for PR / OBR approval forms.</div>
              </div>
            </div>
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault()
                ;(async () => {
                  setStatus(null)
                  const nameValue = deptHead.trim()
                  const desigValue = deptHeadDesignation.trim()
                  if (!nameValue || !desigValue) {
                    setStatus({ type: "error", message: "Please fill out Department Head and Designation." })
                    return
                  }

                  try {
                    await patchOffice({ head: nameValue, headDesignation: desigValue })

                    // Keep profile update for backward compatibility
                    const token = localStorage.getItem('token')
                    const res = await fetch(`${API_URL}/profile`, {
                      method: 'PATCH',
                      headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        deptHead: nameValue,
                        deptHeadDesignation: desigValue,
                      }),
                    })

                    if (!res.ok) {
                      const msg = await res.text().catch(() => '')
                      throw new Error(msg || 'Failed to save')
                    }

                    try {
                      localStorage.setItem(
                        settingsKey,
                        JSON.stringify({
                          officeEmail,
                          contactNumber,
                          deptHead: nameValue,
                          deptHeadDesignation: desigValue,
                        })
                      )
                    } catch {
                      // ignore
                    }

                    setDeptHead(nameValue)
                    setDeptHeadDesignation(desigValue)
                    setStatus({ type: "success", message: "Department head details updated." })
                  } catch (err) {
                    setStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to save. Please try again." })
                  }
                })()
              }}
            >
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Department Head Full Name</label>
                <input
                  type="text"
                  value={deptHead}
                  onChange={(e) => setDeptHead(e.target.value)}
                  aria-label="Department Head"
                  title="Department Head"
                  placeholder="e.g. JUAN DELA CRUZ, MD"
                  className="h-9 w-full rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-slate-50/80 px-3 text-xs text-slate-900 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Official Designation</label>
                <input
                  type="text"
                  value={deptHeadDesignation}
                  onChange={(e) => setDeptHeadDesignation(e.target.value)}
                  aria-label="Department Head Designation"
                  title="Department Head Designation"
                  placeholder="e.g. Provincial Department Head"
                  className="h-9 w-full rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-slate-50/80 px-3 text-xs text-slate-900 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="flex items-end md:col-span-2 justify-end">
                <button
                  type="submit"
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-700 focus:outline-none focus-visible:outline-none"
                >
                  Update Department Head
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
