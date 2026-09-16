import {
  Calendar,
  CalendarDays,
  CalendarOff,
  CalendarPlus,
  Clock,
  Eye,
  Plus,
  Repeat,
  Trash2,
  X,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import DvTemplatePreview, { type DvTemplateModel } from "../../components/DvTemplatePreview"
import ObrTemplatePreview, { type ObrTemplateModel } from "../../components/ObrTemplatePreview"
import PrTemplatePreview from "../../components/PrTemplatePreview"
import PoTemplatePreview, { type PoTemplateModel } from "../../components/PoTemplatePreview"
import { toast } from "../../lib/toast"

type SettingsTab =
  | "pr-and-obr"
  | "default-schedule"
  | "special-dates"
  | "change-password"

type TemplateType = "PR" | "OBR" | "DV" | "PO"

export type PrTemplateModel = {
  items?: Array<{
    itemNo: string
    unit: string
    description: string
    quantity: string
    unitCost: string
    totalCost: string
  }>
  trackingNo?: string
  fund: string
  department: string
  section: string
  prNo: string
  date: string
  fpp: string
  purpose: string
  requestedByName: string
  requestedByDesignation: string
  cashAvailabilityName: string
  cashAvailabilityDesignation: string
  approvedByName: string
  approvedByDesignation: string
  status?: string
  logs?: Array<{ label?: string; byOffice?: string;[key: string]: any }>
  hasPr?: boolean
  hasObr?: boolean
}

type WeekdayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"

type DaySchedule = {
  enabled: boolean
  from: string
  to: string
}

type SpecialDateSection = "recurrent" | "non-recurrent"

type SpecialDateEntry = {
  id: string
  date: string
  from: string | null
  to: string | null
  description: string
  section: SpecialDateSection
}

const RAW_API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api'
const API_URL = RAW_API_URL.replace(/\/$/, '').endsWith('/api')
  ? RAW_API_URL.replace(/\/$/, '')
  : `${RAW_API_URL.replace(/\/$/, '')}/api`

export default function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("pr-and-obr")
  const [activeTemplate, setActiveTemplate] = useState<TemplateType | null>(null)
  const [obrModel, setObrModel] = useState<ObrTemplateModel>({
    payee: "PR",
    office: "N/A",
    address: "N/A",
    obrNo: "100-26-",
    date: "",
    fund: "",
    certifiedAName: "$DEPARTMENTHEAD",
    certifiedAPosition: "$designation",
    certifiedBName: "EDUARDO D. BANZON",
    certifiedBPosition: "Provincial Budget Officer",
  })
  const [prModel, setPrModel] = useState<PrTemplateModel>({
    fund: "",
    department: "",
    section: "",
    prNo: "",
    date: "",
    fpp: "",
    purpose: "",
    requestedByName: "$DEPARTMENTHEAD",
    requestedByDesignation: "$designation",
    cashAvailabilityName: "ALICIA R. MAGPANTAY",
    cashAvailabilityDesignation: "Provincial Treasurer",
    approvedByName: "JOSE ENRIQUE S. GARCIA III",
    approvedByDesignation: "Provincial Governor",
  })

  const [dvModel, setDvModel] = useState<DvTemplateModel>({
    certifiedAName: "$DEPARTMENTHEAD",
    certifiedAPosition: "$designation",
    certifiedBName: "MYRNA B. ROMAN",
    certifiedBPosition: "Acting Provincial Accountant",
    certifiedCName: "ALICIA R. MAGPANTAY",
    certifiedCPosition: "Provincial Treasurer",
    approvedForPaymentName: "MA. CRISTINA M. GARCIA",
    approvedForPaymentPosition: "Acting - Provincial Governor",
    certifiedCorrectName: "MYRNA B. ROMAN",
    certifiedCorrectPosition: "Acting Provincial Accountant",
  })

  const [poModel, setPoModel] = useState<PoTemplateModel>({
    supplier: "",
    address: "",
    tin: "",
    poNo: "",
    date: "",
    modeOfProcurement: "",
    prNo: "",
    placeOfDelivery: "",
    dateOfDelivery: "",
    deliveryTerm: "",
    paymentTerm: "",
    items: [],
    approvedByName: "JOSE ENRIQUE S. GARCIA III",
    approvedByDesignation: "PROVINCIAL GOVERNOR",
    conformeSupplierName: "",
    conformeDate: "",
    sanggunianResolutionNo: "",
    secretaryName: "",
    secretaryDate: "",
  })

  const [defaultSchedule, setDefaultSchedule] = useState<Record<WeekdayKey, DaySchedule>>({
    monday: { enabled: true, from: '08:00', to: '17:00' },
    tuesday: { enabled: true, from: '08:00', to: '17:00' },
    wednesday: { enabled: true, from: '08:00', to: '17:00' },
    thursday: { enabled: true, from: '08:00', to: '17:00' },
    friday: { enabled: true, from: '08:00', to: '17:00' },
    saturday: { enabled: false, from: '', to: '' },
    sunday: { enabled: false, from: '', to: '' },
  })
  const [scheduleSaving, setScheduleSaving] = useState(false)

  // Load persisted schedule from API
  useEffect(() => {
    fetch(`${API_URL}/settings/schedule`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.defaultSchedule) setDefaultSchedule(data.defaultSchedule)
      })
      .catch(() => { /* ignore – use default */ })
  }, [])

  async function saveSchedule() {
    setScheduleSaving(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_URL}/settings/schedule`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ defaultSchedule }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        toast.error(errData.message || 'Failed to save schedule.')
      } else {
        toast.success('Schedule saved successfully.')
      }
    } catch {
      toast.error('Network error. Could not save schedule.')
    } finally {
      setScheduleSaving(false)
    }
  }

  const [specialDates, setSpecialDates] = useState<SpecialDateEntry[]>([])
  const [isAddSpecialDateOpen, setIsAddSpecialDateOpen] = useState(false)
  const [specialDateDraft, setSpecialDateDraft] = useState<{
    date: string
    from: string
    to: string
    description: string
    section: SpecialDateSection
    noWorkSchedule: boolean
  }>({
    date: "",
    from: "",
    to: "",
    description: "",
    section: "recurrent",
    noWorkSchedule: false,
  })
  const [specialDateDraftError, setSpecialDateDraftError] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmNewPassword, setConfirmNewPassword] = useState("")
  const [passwordSaving, setPasswordSaving] = useState(false)

  async function updatePassword() {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      toast.error("Please fill in all password fields.")
      return
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.")
      return
    }
    if (newPassword !== confirmNewPassword) {
      toast.error("New passwords do not match.")
      return
    }

    setPasswordSaving(true)
    try {
      const token = localStorage.getItem("token")
      const res = await fetch(`${API_URL}/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword: confirmNewPassword,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.message || "Failed to update password.")
        return
      }
      toast.success("Password updated successfully.")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmNewPassword("")
    } catch {
      toast.error("Network error. Could not update password.")
    } finally {
      setPasswordSaving(false)
    }
  }

  // Load persisted special dates from API
  useEffect(() => {
    fetch(`${API_URL}/settings/special-dates`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (Array.isArray(data?.specialDates)) setSpecialDates(data.specialDates)
      })
      .catch(() => { })
  }, [])

  async function saveSpecialDates(dates: SpecialDateEntry[]) {
    try {
      const token = localStorage.getItem('token')
      await fetch(`${API_URL}/settings/special-dates`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ specialDates: dates }),
      })
    } catch {
      // silently ignore – the UI already updated optimistically
    }
  }

  const isTemplateModalOpen = activeTemplate !== null

  const tabs = useMemo(
    () => [
      { key: "pr-and-obr" as const, label: "Templates" },
      { key: "default-schedule" as const, label: "Default Schedule" },
      { key: "special-dates" as const, label: "Special Dates" },
      { key: "change-password" as const, label: "Change Password" },
    ],
    []
  )

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 ring-1 ring-inset ring-blue-700/10">
            The Bunker &bull; Bataan Capitol DTS
          </span>
        </div>
        <div className="text-xl font-bold tracking-tight text-slate-900">System Settings</div>
        <div className="text-xs text-slate-500">Configure default working hours, special calendar dates, templates, and account security</div>
      </header>

      <div className="rounded-2xl border border-slate-200/80 bg-white text-slate-900 shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/50 px-4 pt-4 lg:px-6">
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => {
              const isActive = tab === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`inline-flex h-9 items-center justify-center whitespace-nowrap rounded-lg px-3.5 text-xs font-semibold transition focus:outline-none focus-visible:outline-none ${isActive
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
          <div className="h-3" />
        </div>

        <div className="p-4 lg:p-6">
          {tab === "pr-and-obr" ? (
            <div className="space-y-4">
              <div>
                <div className="text-base font-bold tracking-tight text-slate-900">Templates</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  Manage the official print templates used for PR, OBR, PO, and DV forms across provincial departments.
                </div>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
                <div className="relative w-full overflow-auto">
                  <table className="w-full caption-bottom text-sm border-collapse border border-slate-200 [&_th]:border [&_th]:border-blue-700 [&_td]:border [&_td]:border-slate-200">
                    <thead className="bg-blue-600 text-white">
                      <tr>
                        <th className="h-10 px-4 text-left align-middle text-[11px] font-bold uppercase tracking-wider text-white">
                          Templates
                        </th>
                        <th className="h-10 px-4 text-left align-middle text-[11px] font-bold uppercase tracking-wider text-white">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr className="transition-colors hover:bg-slate-50/80">
                        <td className="px-4 py-3.5 align-middle font-semibold text-slate-800">PR (Purchase Request)</td>
                        <td className="px-4 py-3.5 align-middle">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveTemplate("PR")}
                              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:outline-none"
                              title="View / Edit PR Template"
                            >
                              <Eye className="size-3.5" />
                              View / Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                      <tr className="transition-colors hover:bg-slate-50/80">
                        <td className="px-4 py-3.5 align-middle font-semibold text-slate-800">OBR (Obligation Request)</td>
                        <td className="px-4 py-3.5 align-middle">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveTemplate("OBR")}
                              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:outline-none"
                              title="View / Edit OBR Template"
                            >
                              <Eye className="size-3.5" />
                              View / Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                      <tr className="transition-colors hover:bg-slate-50/80">
                        <td className="px-4 py-3.5 align-middle font-semibold text-slate-800">PO (Purchase Order)</td>
                        <td className="px-4 py-3.5 align-middle">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveTemplate("PO")}
                              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:outline-none"
                              title="View / Edit PO Template"
                            >
                              <Eye className="size-3.5" />
                              View / Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                      <tr className="transition-colors hover:bg-slate-50/80">
                        <td className="px-4 py-3.5 align-middle font-semibold text-slate-800">DV (Disbursement Voucher)</td>
                        <td className="px-4 py-3.5 align-middle">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveTemplate("DV")}
                              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:outline-none"
                              title="View / Edit DV Template"
                            >
                              <Eye className="size-3.5" />
                              View / Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : tab === "default-schedule" ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-base font-bold tracking-tight text-slate-900">Default Working Schedules</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    Configure official working hours per day for tracking Turn-Around Time (TAT) and departmental SLA.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={saveSchedule}
                  disabled={scheduleSaving}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-700 active:scale-95 focus:outline-none focus-visible:outline-none disabled:opacity-60"
                >
                  <Clock className="size-3.5" />
                  {scheduleSaving ? "Saving..." : "Save Schedules"}
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {(
                  [
                    { key: "monday", label: "Monday" },
                    { key: "tuesday", label: "Tuesday" },
                    { key: "wednesday", label: "Wednesday" },
                    { key: "thursday", label: "Thursday" },
                    { key: "friday", label: "Friday" },
                    { key: "saturday", label: "Saturday" },
                    { key: "sunday", label: "Sunday" },
                  ] as const
                ).map((d) => {
                  const day = defaultSchedule[d.key]
                  return (
                    <div
                      key={d.key}
                      className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-all ${
                        day.enabled
                          ? "border-blue-200/80 ring-1 ring-blue-500/10 hover:shadow-md hover:border-blue-300"
                          : "border-slate-200/70 bg-slate-50/40 opacity-75 hover:opacity-100"
                      }`}
                    >
                      {/* Card Header */}
                      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`flex size-9 items-center justify-center rounded-xl transition-colors ${
                              day.enabled
                                ? "bg-blue-50 text-blue-600 ring-1 ring-blue-500/15"
                                : "bg-slate-100 text-slate-400"
                            }`}
                          >
                            <Clock className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <div
                              className={`truncate text-sm font-bold tracking-tight ${
                                day.enabled ? "text-slate-900" : "text-slate-600"
                              }`}
                            >
                              {d.label}
                            </div>
                            <div className="mt-0.5 text-xs">
                              {day.enabled ? (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
                                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Working Day
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
                                  <span className="size-1.5 rounded-full bg-slate-300" />
                                  Closed / Off
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Toggle Switch */}
                        <label
                          htmlFor={`${d.key}-enabled`}
                          className="inline-flex cursor-pointer items-center select-none"
                          title={day.enabled ? "Disable working schedule" : "Enable working schedule"}
                        >
                          <input
                            id={`${d.key}-enabled`}
                            type="checkbox"
                            className="sr-only"
                            checked={day.enabled}
                            onChange={() =>
                              setDefaultSchedule((v) => ({
                                ...v,
                                [d.key]: {
                                  ...v[d.key],
                                  enabled: !v[d.key].enabled,
                                  from: !v[d.key].enabled ? v[d.key].from || "08:00" : v[d.key].from,
                                  to: !v[d.key].enabled ? v[d.key].to || "17:00" : v[d.key].to,
                                },
                              }))
                            }
                          />
                          <span
                            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                              day.enabled
                                ? "border-blue-600 bg-blue-600 shadow-sm shadow-blue-500/25"
                                : "border-slate-300 bg-slate-200"
                            }`}
                          >
                            <span
                              className={`inline-block size-5 rounded-full bg-white shadow-sm transition-transform ${
                                day.enabled ? "translate-x-5" : "translate-x-0.5"
                              }`}
                            />
                          </span>
                        </label>
                      </div>

                      {/* Card Body - Time Inputs */}
                      <div className="p-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="grid gap-1.5">
                            <label
                              htmlFor={`${d.key}-from`}
                              className={`text-[11px] font-semibold transition-colors ${
                                day.enabled ? "text-slate-700" : "text-slate-400"
                              }`}
                            >
                              From
                            </label>
                            <input
                              id={`${d.key}-from`}
                              type="time"
                              className={`h-10 w-full rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-slate-50/80 px-3 text-xs text-slate-800 transition placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                                !day.enabled
                                  ? "border-l-slate-300 bg-slate-100 opacity-40 cursor-not-allowed text-slate-400"
                                  : ""
                              }`}
                              value={day.from}
                              disabled={!day.enabled}
                              onChange={(e) =>
                                setDefaultSchedule((v) => ({
                                  ...v,
                                  [d.key]: { ...v[d.key], from: e.target.value },
                                }))
                              }
                            />
                          </div>

                          <div className="grid gap-1.5">
                            <label
                              htmlFor={`${d.key}-to`}
                              className={`text-[11px] font-semibold transition-colors ${
                                day.enabled ? "text-slate-700" : "text-slate-400"
                              }`}
                            >
                              To
                            </label>
                            <input
                              id={`${d.key}-to`}
                              type="time"
                              className={`h-10 w-full rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-slate-50/80 px-3 text-xs text-slate-800 transition placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                                !day.enabled
                                  ? "border-l-slate-300 bg-slate-100 opacity-40 cursor-not-allowed text-slate-400"
                                  : ""
                              }`}
                              value={day.to}
                              disabled={!day.enabled}
                              onChange={(e) =>
                                setDefaultSchedule((v) => ({
                                  ...v,
                                  [d.key]: { ...v[d.key], to: e.target.value },
                                }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : tab === "special-dates" ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-base font-bold tracking-tight text-slate-900">Special Dates & Holidays</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    Manage non-working holidays and recurrent annual events across provincial offices.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSpecialDateDraft({
                      date: "",
                      from: "08:00",
                      to: "17:00",
                      description: "",
                      section: "recurrent",
                      noWorkSchedule: false,
                    })
                    setIsAddSpecialDateOpen(true)
                  }}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-700 active:scale-95 focus:outline-none focus-visible:outline-none"
                >
                  <Plus className="size-3.5" />
                  Add New Date
                </button>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                {/* Recurrent Events Card */}
                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm flex flex-col">
                  <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 px-4 py-3 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-7 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm ring-1 ring-white/20">
                        <Repeat className="size-3.5 text-white" />
                      </div>
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-white">Recurrent Events</div>
                        <div className="text-[10px] text-blue-100 font-medium">Annual & regular holidays</div>
                      </div>
                    </div>
                    <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm ring-1 ring-white/20">
                      {specialDates.filter((d) => d.section === "recurrent").length} {specialDates.filter((d) => d.section === "recurrent").length === 1 ? "event" : "events"}
                    </span>
                  </div>

                  <div className="overflow-auto flex-1">
                    <table className="w-full caption-bottom text-sm border-collapse">
                      <thead className="bg-slate-50/90 border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-3.5 py-2.5">Date</th>
                          <th className="px-3.5 py-2.5">Schedule</th>
                          <th className="px-3.5 py-2.5">Description</th>
                          <th className="px-3.5 py-2.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {specialDates.filter((d) => d.section === "recurrent").length === 0 ? (
                          <tr>
                            <td className="p-8 text-center" colSpan={4}>
                              <div className="flex flex-col items-center justify-center">
                                <div className="flex size-11 items-center justify-center rounded-full bg-blue-50 text-blue-500 ring-1 ring-blue-100 mb-2">
                                  <CalendarOff className="size-5" />
                                </div>
                                <div className="text-xs font-semibold text-slate-700">No recurrent events recorded</div>
                                <div className="text-[11px] text-slate-400 mt-0.5">Click "+ Add New Date" to schedule annual events</div>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          specialDates
                            .filter((d) => d.section === "recurrent")
                            .map((d) => (
                              <tr key={d.id} className="hover:bg-blue-50/40 transition-colors">
                                <td className="px-3.5 py-3 text-xs font-semibold text-slate-900 whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="size-3.5 text-blue-500 shrink-0" />
                                    <span>{d.date}</span>
                                  </div>
                                </td>
                                <td className="px-3.5 py-3 text-xs text-slate-600 whitespace-nowrap">
                                  {!d.from && !d.to ? (
                                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                                      No Work
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                      <Clock className="size-3 text-slate-400" />
                                      {d.from ?? "--"} &ndash; {d.to ?? "--"}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3.5 py-3 text-xs text-slate-700 font-medium">{d.description || "-"}</td>
                                <td className="px-3.5 py-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = specialDates.filter((x) => x.id !== d.id)
                                      setSpecialDates(next)
                                      saveSpecialDates(next)
                                    }}
                                    className="inline-flex h-7 items-center justify-center gap-1 rounded-lg bg-rose-50 border border-rose-200/70 px-2.5 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-600 hover:text-white hover:border-rose-600 focus:outline-none active:scale-95"
                                    title="Delete event"
                                  >
                                    <Trash2 className="size-3" />
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Non-recurrent Events Card */}
                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm flex flex-col">
                  <div className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-700 px-4 py-3 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-7 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm ring-1 ring-white/20">
                        <CalendarDays className="size-3.5 text-white" />
                      </div>
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-white">Non-recurrent Events</div>
                        <div className="text-[10px] text-emerald-100 font-medium">One-time declared special days</div>
                      </div>
                    </div>
                    <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm ring-1 ring-white/20">
                      {specialDates.filter((d) => d.section === "non-recurrent").length} {specialDates.filter((d) => d.section === "non-recurrent").length === 1 ? "event" : "events"}
                    </span>
                  </div>

                  <div className="overflow-auto flex-1">
                    <table className="w-full caption-bottom text-sm border-collapse">
                      <thead className="bg-slate-50/90 border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-3.5 py-2.5">Date</th>
                          <th className="px-3.5 py-2.5">Schedule</th>
                          <th className="px-3.5 py-2.5">Description</th>
                          <th className="px-3.5 py-2.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {specialDates.filter((d) => d.section === "non-recurrent").length === 0 ? (
                          <tr>
                            <td className="p-8 text-center" colSpan={4}>
                              <div className="flex flex-col items-center justify-center">
                                <div className="flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 mb-2">
                                  <CalendarOff className="size-5" />
                                </div>
                                <div className="text-xs font-semibold text-slate-700">No non-recurrent events recorded</div>
                                <div className="text-[11px] text-slate-400 mt-0.5">Click "+ Add New Date" to schedule special dates</div>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          specialDates
                            .filter((d) => d.section === "non-recurrent")
                            .map((d) => (
                              <tr key={d.id} className="hover:bg-emerald-50/30 transition-colors">
                                <td className="px-3.5 py-3 text-xs font-semibold text-slate-900 whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="size-3.5 text-emerald-600 shrink-0" />
                                    <span>{d.date}</span>
                                  </div>
                                </td>
                                <td className="px-3.5 py-3 text-xs text-slate-600 whitespace-nowrap">
                                  {!d.from && !d.to ? (
                                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                                      No Work
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                      <Clock className="size-3 text-slate-400" />
                                      {d.from ?? "--"} &ndash; {d.to ?? "--"}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3.5 py-3 text-xs text-slate-700 font-medium">{d.description || "-"}</td>
                                <td className="px-3.5 py-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = specialDates.filter((x) => x.id !== d.id)
                                      setSpecialDates(next)
                                      saveSpecialDates(next)
                                    }}
                                    className="inline-flex h-7 items-center justify-center gap-1 rounded-lg bg-rose-50 border border-rose-200/70 px-2.5 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-600 hover:text-white hover:border-rose-600 focus:outline-none active:scale-95"
                                    title="Delete event"
                                  >
                                    <Trash2 className="size-3" />
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
                <div className="text-sm font-bold text-slate-900">Change Password</div>
                <div className="mt-0.5 text-xs text-slate-500">Update your administrator account password.</div>

                <div className="mt-4 grid gap-3">
                  <div>
                    <label htmlFor="current-password" className="text-xs font-medium text-slate-600">
                      Current password
                    </label>
                    <input
                      id="current-password"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-slate-50/80 px-3 text-xs text-slate-900 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="new-password" className="text-xs font-medium text-slate-600">
                      New password
                    </label>
                    <input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-slate-50/80 px-3 text-xs text-slate-900 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="confirm-new-password" className="text-xs font-medium text-slate-600">
                      Confirm new password
                    </label>
                    <input
                      id="confirm-new-password"
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-slate-50/80 px-3 text-xs text-slate-900 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      disabled={passwordSaving}
                      onClick={() => void updatePassword()}
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-700 focus:outline-none focus-visible:outline-none disabled:opacity-60"
                    >
                      {passwordSaving ? "Updating..." : "Update Password"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
                <div className="text-sm font-bold text-slate-900">Security Guidance</div>
                <div className="mt-0.5 text-xs text-slate-500">Recommended security practices for Capitol admin accounts.</div>
                <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-xs text-blue-900 leading-relaxed space-y-2">
                  <p className="font-semibold text-blue-950">Password Requirements:</p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-700">
                    <li>Minimum length: 8 characters</li>
                    <li>Include both uppercase and lowercase letters</li>
                    <li>Avoid using predictable patterns or personal names</li>
                    <li>Do not share administrator credentials with unauthorized staff</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {isTemplateModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) {
              setActiveTemplate(null)
            }
          }}
        >
          <div className="flex h-[80vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 lg:px-6">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {activeTemplate === "PR"
                    ? "Purchase Request (PR) Template"
                    : activeTemplate === "OBR"
                    ? "Obligation Request (OBR) Template"
                    : activeTemplate === "PO"
                    ? "Purchase Order (PO) Template"
                    : "Disbursement Voucher (DV) Template"}
                </div>
                <div className="truncate text-xs text-muted-foreground">Edit template details and settings</div>
              </div>
            </div>

            <div className="grid flex-1 gap-0 overflow-hidden lg:grid-cols-[1fr_360px]">
              <div className="h-full overflow-auto bg-slate-50 p-4 lg:p-6">
                {activeTemplate === "OBR" ? (
                  <ObrTemplatePreview model={obrModel} />
                ) : activeTemplate === "PR" ? (
                  <PrTemplatePreview model={prModel} />
                ) : activeTemplate === "DV" ? (
                  <DvTemplatePreview model={dvModel} />
                ) : activeTemplate === "PO" ? (
                  <PoTemplatePreview model={poModel} />
                ) : (
                  <div className="mx-auto w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="aspect-3/4 w-full rounded-lg border border-slate-200 bg-white" />
                    <div className="mt-3 text-xs text-muted-foreground">
                      Preview placeholder.
                    </div>
                  </div>
                )}
              </div>

              <div className="h-full overflow-auto border-l border-slate-200 bg-white p-4 lg:p-6">
                {activeTemplate === "OBR" ? (
                  <div>
                    <div className="text-sm font-semibold">Editor</div>
                    <div className="mt-1 text-sm text-muted-foreground">Edit OBR details.</div>

                    <div className="mt-4 grid gap-3">
                      <div className="grid gap-2">
                        <label htmlFor="obr-no" className="text-xs font-medium text-slate-600">
                          OBR No.
                        </label>
                        <input
                          id="obr-no"
                          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                          value={obrModel.obrNo}
                          onChange={(e) => setObrModel((v) => ({ ...v, obrNo: e.target.value }))}
                        />
                      </div>

                      <div className="grid gap-2">
                        <label htmlFor="obr-payee" className="text-xs font-medium text-slate-600">
                          Payee
                        </label>
                        <input
                          id="obr-payee"
                          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                          value={obrModel.payee}
                          onChange={(e) => setObrModel((v) => ({ ...v, payee: e.target.value }))}
                        />
                      </div>

                      <div className="grid gap-2">
                        <label htmlFor="obr-office" className="text-xs font-medium text-slate-600">
                          Office
                        </label>
                        <input
                          id="obr-office"
                          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                          value={obrModel.office}
                          onChange={(e) => setObrModel((v) => ({ ...v, office: e.target.value }))}
                        />
                      </div>

                      <div className="grid gap-2">
                        <label htmlFor="obr-address" className="text-xs font-medium text-slate-600">
                          Address
                        </label>
                        <input
                          id="obr-address"
                          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                          value={obrModel.address}
                          onChange={(e) => setObrModel((v) => ({ ...v, address: e.target.value }))}
                        />
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-semibold text-slate-700">Certified A</div>
                        <div className="mt-2 grid gap-2">
                          <label htmlFor="obr-certified-a-name" className="text-xs font-medium text-slate-600">
                            Printed name
                          </label>
                          <input
                            id="obr-certified-a-name"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={obrModel.certifiedAName}
                            onChange={(e) => setObrModel((v) => ({ ...v, certifiedAName: e.target.value }))}
                          />
                          <label htmlFor="obr-certified-a-position" className="text-xs font-medium text-slate-600">
                            Position
                          </label>
                          <input
                            id="obr-certified-a-position"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={obrModel.certifiedAPosition}
                            onChange={(e) => setObrModel((v) => ({ ...v, certifiedAPosition: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-semibold text-slate-700">Certified B</div>
                        <div className="mt-2 grid gap-2">
                          <label htmlFor="obr-certified-b-name" className="text-xs font-medium text-slate-600">
                            Printed name
                          </label>
                          <input
                            id="obr-certified-b-name"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={obrModel.certifiedBName}
                            onChange={(e) => setObrModel((v) => ({ ...v, certifiedBName: e.target.value }))}
                          />
                          <label htmlFor="obr-certified-b-position" className="text-xs font-medium text-slate-600">
                            Position
                          </label>
                          <input
                            id="obr-certified-b-position"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={obrModel.certifiedBPosition}
                            onChange={(e) => setObrModel((v) => ({ ...v, certifiedBPosition: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="pt-2">
                        <button
                          type="button"
                          className="inline-flex h-9 w-full items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus-visible:outline-none"
                        >
                          Save changes
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTemplate(null)}
                          className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : activeTemplate === "PR" ? (
                  <div>
                    <div className="text-sm font-semibold">Editor</div>
                    <div className="mt-1 text-sm text-muted-foreground">Edit PR details.</div>

                    <div className="mt-4 grid gap-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-semibold text-slate-700">Requested by</div>
                        <div className="mt-2 grid gap-2">
                          <label htmlFor="pr-requested-name" className="text-xs font-medium text-slate-600">
                            Printed name
                          </label>
                          <input
                            id="pr-requested-name"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                            value={prModel.requestedByName}
                            disabled
                          />
                          <label htmlFor="pr-requested-desig" className="text-xs font-medium text-slate-600">
                            Designation
                          </label>
                          <input
                            id="pr-requested-desig"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                            value={prModel.requestedByDesignation}
                            disabled
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-semibold text-slate-700">Cash Availability</div>
                        <div className="mt-2 grid gap-2">
                          <label htmlFor="pr-cash-name" className="text-xs font-medium text-slate-600">
                            Printed name
                          </label>
                          <input
                            id="pr-cash-name"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={prModel.cashAvailabilityName}
                            onChange={(e) => setPrModel((v) => ({ ...v, cashAvailabilityName: e.target.value }))}
                          />
                          <label htmlFor="pr-cash-desig" className="text-xs font-medium text-slate-600">
                            Designation
                          </label>
                          <input
                            id="pr-cash-desig"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={prModel.cashAvailabilityDesignation}
                            onChange={(e) => setPrModel((v) => ({ ...v, cashAvailabilityDesignation: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-semibold text-slate-700">Approved by</div>
                        <div className="mt-2 grid gap-2">
                          <label htmlFor="pr-approved-name" className="text-xs font-medium text-slate-600">
                            Printed name
                          </label>
                          <input
                            id="pr-approved-name"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={prModel.approvedByName}
                            onChange={(e) => setPrModel((v) => ({ ...v, approvedByName: e.target.value }))}
                          />
                          <label htmlFor="pr-approved-desig" className="text-xs font-medium text-slate-600">
                            Designation
                          </label>
                          <input
                            id="pr-approved-desig"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={prModel.approvedByDesignation}
                            onChange={(e) => setPrModel((v) => ({ ...v, approvedByDesignation: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="pt-2">
                        <button
                          type="button"
                          className="inline-flex h-9 w-full items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus-visible:outline-none"
                        >
                          Save changes
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTemplate(null)}
                          className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : activeTemplate === "DV" ? (
                  <div>
                    <div className="text-sm font-semibold">Editor</div>
                    <div className="mt-1 text-sm text-muted-foreground">Edit DV signatories and details.</div>

                    <div className="mt-4 grid gap-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-semibold text-slate-700">Certified A</div>
                        <div className="mt-2 grid gap-2">
                          <label htmlFor="dv-certified-a-name" className="text-xs font-medium text-slate-600">Printed name</label>
                          <input
                            id="dv-certified-a-name"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={dvModel.certifiedAName}
                            onChange={(e) => setDvModel((v) => ({ ...v, certifiedAName: e.target.value }))}
                          />
                          <label htmlFor="dv-certified-a-pos" className="text-xs font-medium text-slate-600">Position</label>
                          <input
                            id="dv-certified-a-pos"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={dvModel.certifiedAPosition}
                            onChange={(e) => setDvModel((v) => ({ ...v, certifiedAPosition: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-semibold text-slate-700">Certified B</div>
                        <div className="mt-2 grid gap-2">
                          <label htmlFor="dv-certified-b-name" className="text-xs font-medium text-slate-600">Printed name</label>
                          <input
                            id="dv-certified-b-name"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={dvModel.certifiedBName}
                            onChange={(e) => setDvModel((v) => ({ ...v, certifiedBName: e.target.value }))}
                          />
                          <label htmlFor="dv-certified-b-pos" className="text-xs font-medium text-slate-600">Position</label>
                          <input
                            id="dv-certified-b-pos"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={dvModel.certifiedBPosition}
                            onChange={(e) => setDvModel((v) => ({ ...v, certifiedBPosition: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-semibold text-slate-700">Certified C – Funds Available</div>
                        <div className="mt-2 grid gap-2">
                          <label htmlFor="dv-certified-c-name" className="text-xs font-medium text-slate-600">Printed name</label>
                          <input
                            id="dv-certified-c-name"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={dvModel.certifiedCName}
                            onChange={(e) => setDvModel((v) => ({ ...v, certifiedCName: e.target.value }))}
                          />
                          <label htmlFor="dv-certified-c-pos" className="text-xs font-medium text-slate-600">Position</label>
                          <input
                            id="dv-certified-c-pos"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={dvModel.certifiedCPosition}
                            onChange={(e) => setDvModel((v) => ({ ...v, certifiedCPosition: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-semibold text-slate-700">Approved for Payment (D)</div>
                        <div className="mt-2 grid gap-2">
                          <label htmlFor="dv-approved-name" className="text-xs font-medium text-slate-600">Printed name</label>
                          <input
                            id="dv-approved-name"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={dvModel.approvedForPaymentName}
                            onChange={(e) => setDvModel((v) => ({ ...v, approvedForPaymentName: e.target.value }))}
                          />
                          <label htmlFor="dv-approved-pos" className="text-xs font-medium text-slate-600">Position</label>
                          <input
                            id="dv-approved-pos"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={dvModel.approvedForPaymentPosition}
                            onChange={(e) => setDvModel((v) => ({ ...v, approvedForPaymentPosition: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-semibold text-slate-700">Certified Correct (Footer)</div>
                        <div className="mt-2 grid gap-2">
                          <label htmlFor="dv-correct-name" className="text-xs font-medium text-slate-600">Printed name</label>
                          <input
                            id="dv-correct-name"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={dvModel.certifiedCorrectName}
                            onChange={(e) => setDvModel((v) => ({ ...v, certifiedCorrectName: e.target.value }))}
                          />
                          <label htmlFor="dv-correct-pos" className="text-xs font-medium text-slate-600">Position</label>
                          <input
                            id="dv-correct-pos"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={dvModel.certifiedCorrectPosition}
                            onChange={(e) => setDvModel((v) => ({ ...v, certifiedCorrectPosition: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="pt-2">
                        <button
                          type="button"
                          className="inline-flex h-9 w-full items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus-visible:outline-none"
                        >
                          Save changes
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTemplate(null)}
                          className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : activeTemplate === "PO" ? (
                  <div>
                    <div className="text-sm font-semibold">Editor</div>
                    <div className="mt-1 text-sm text-muted-foreground">Edit PO signatories and details.</div>

                    <div className="mt-4 grid gap-3">
                      <div className="grid gap-2">
                        <label htmlFor="po-supplier" className="text-xs font-medium text-slate-600">Supplier</label>
                        <input
                          id="po-supplier"
                          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                          value={poModel.supplier ?? ""}
                          onChange={(e) => setPoModel((v) => ({ ...v, supplier: e.target.value }))}
                        />
                      </div>

                      <div className="grid gap-2">
                        <label htmlFor="po-address" className="text-xs font-medium text-slate-600">Supplier Address</label>
                        <input
                          id="po-address"
                          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                          value={poModel.address ?? ""}
                          onChange={(e) => setPoModel((v) => ({ ...v, address: e.target.value }))}
                        />
                      </div>

                      <div className="grid gap-2">
                        <label htmlFor="po-mode" className="text-xs font-medium text-slate-600">Mode of Procurement</label>
                        <input
                          id="po-mode"
                          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                          value={poModel.modeOfProcurement ?? ""}
                          onChange={(e) => setPoModel((v) => ({ ...v, modeOfProcurement: e.target.value }))}
                        />
                      </div>

                      <div className="grid gap-2">
                        <label htmlFor="po-delivery" className="text-xs font-medium text-slate-600">Place of Delivery</label>
                        <input
                          id="po-delivery"
                          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                          value={poModel.placeOfDelivery ?? ""}
                          onChange={(e) => setPoModel((v) => ({ ...v, placeOfDelivery: e.target.value }))}
                        />
                      </div>

                      <div className="grid gap-2">
                        <label htmlFor="po-delivery-term" className="text-xs font-medium text-slate-600">Delivery Term</label>
                        <input
                          id="po-delivery-term"
                          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                          value={poModel.deliveryTerm ?? ""}
                          onChange={(e) => setPoModel((v) => ({ ...v, deliveryTerm: e.target.value }))}
                        />
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-semibold text-slate-700">Approved by</div>
                        <div className="mt-2 grid gap-2">
                          <label htmlFor="po-approved-name" className="text-xs font-medium text-slate-600">Printed name</label>
                          <input
                            id="po-approved-name"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={poModel.approvedByName ?? ""}
                            onChange={(e) => setPoModel((v) => ({ ...v, approvedByName: e.target.value }))}
                          />
                          <label htmlFor="po-approved-desig" className="text-xs font-medium text-slate-600">Designation</label>
                          <input
                            id="po-approved-desig"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={poModel.approvedByDesignation ?? ""}
                            onChange={(e) => setPoModel((v) => ({ ...v, approvedByDesignation: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-semibold text-slate-700">Sanggunian Resolution</div>
                        <div className="mt-2 grid gap-2">
                          <label htmlFor="po-sanggunian-no" className="text-xs font-medium text-slate-600">Resolution No.</label>
                          <input
                            id="po-sanggunian-no"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={poModel.sanggunianResolutionNo ?? ""}
                            onChange={(e) => setPoModel((v) => ({ ...v, sanggunianResolutionNo: e.target.value }))}
                          />
                          <label htmlFor="po-secretary-name" className="text-xs font-medium text-slate-600">Secretary Name</label>
                          <input
                            id="po-secretary-name"
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus-visible:outline-none"
                            value={poModel.secretaryName ?? ""}
                            onChange={(e) => setPoModel((v) => ({ ...v, secretaryName: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="pt-2">
                        <button
                          type="button"
                          className="inline-flex h-9 w-full items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus-visible:outline-none"
                        >
                          Save changes
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTemplate(null)}
                          className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-sm font-semibold">Editor</div>
                    <div className="mt-1 text-sm text-muted-foreground">Update template metadata and defaults.</div>
                    <div className="mt-4 grid gap-3">
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => setActiveTemplate(null)}
                          className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isAddSpecialDateOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) {
              setIsAddSpecialDateOpen(false)
            }
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm ring-1 ring-white/20 shadow-sm">
                  <CalendarPlus className="size-4 text-white" />
                </div>
                <div>
                  <div className="text-sm font-bold tracking-tight text-white">Add Special Date / Holiday</div>
                  <div className="text-[11px] text-blue-100 font-medium">Configure non-working or custom working days</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddSpecialDateOpen(false)}
                className="rounded-lg p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white focus:outline-none"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-4 p-5">
              <div className="grid gap-1.5">
                <label htmlFor="special-date" className="text-xs font-semibold text-slate-700">
                  Date
                </label>
                <input
                  id="special-date"
                  type="date"
                  className="h-10 w-full rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-slate-50/80 px-3 text-xs text-slate-800 transition placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={specialDateDraft.date}
                  onChange={(e) => {
                    setSpecialDateDraftError(null)
                    setSpecialDateDraft((v) => ({ ...v, date: e.target.value }))
                  }}
                />
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Working Hours</span>
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={specialDateDraft.noWorkSchedule}
                      className="size-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      onChange={(e) => {
                        setSpecialDateDraftError(null)
                        const checked = e.target.checked
                        setSpecialDateDraft((v) => ({
                          ...v,
                          noWorkSchedule: checked,
                          from: checked ? "" : v.from,
                          to: checked ? "" : v.to,
                        }))
                      }}
                    />
                    <span>No Work Schedule (All-day Holiday)</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <label htmlFor="special-from" className="text-[11px] font-medium text-slate-500">
                      From
                    </label>
                    <input
                      id="special-from"
                      type="time"
                      disabled={specialDateDraft.noWorkSchedule}
                      className={`h-9 w-full rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-white px-3 text-xs text-slate-800 transition focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                        specialDateDraft.noWorkSchedule ? "opacity-40 cursor-not-allowed bg-slate-100" : ""
                      }`}
                      value={specialDateDraft.from}
                      onChange={(e) => {
                        setSpecialDateDraftError(null)
                        setSpecialDateDraft((v) => ({ ...v, noWorkSchedule: false, from: e.target.value }))
                      }}
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <label htmlFor="special-to" className="text-[11px] font-medium text-slate-500">
                      To
                    </label>
                    <input
                      id="special-to"
                      type="time"
                      disabled={specialDateDraft.noWorkSchedule}
                      className={`h-9 w-full rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-white px-3 text-xs text-slate-800 transition focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                        specialDateDraft.noWorkSchedule ? "opacity-40 cursor-not-allowed bg-slate-100" : ""
                      }`}
                      value={specialDateDraft.to}
                      onChange={(e) => {
                        setSpecialDateDraftError(null)
                        setSpecialDateDraft((v) => ({ ...v, noWorkSchedule: false, to: e.target.value }))
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="special-description" className="text-xs font-semibold text-slate-700">
                  Description / Event Name
                </label>
                <input
                  id="special-description"
                  type="text"
                  placeholder="e.g., Araw ng Kagitingan / Provincial Holiday"
                  className="h-10 w-full rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-slate-50/80 px-3 text-xs text-slate-800 transition placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={specialDateDraft.description}
                  onChange={(e) => {
                    setSpecialDateDraftError(null)
                    setSpecialDateDraft((v) => ({ ...v, description: e.target.value }))
                  }}
                />
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="special-section" className="text-xs font-semibold text-slate-700">
                  Category
                </label>
                <select
                  id="special-section"
                  className="h-10 w-full rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-slate-50/80 px-3 text-xs text-slate-800 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={specialDateDraft.section}
                  onChange={(e) => {
                    setSpecialDateDraftError(null)
                    const v = e.target.value === "non-recurrent" ? "non-recurrent" : "recurrent"
                    setSpecialDateDraft((cur) => ({ ...cur, section: v }))
                  }}
                >
                  <option value="recurrent">Recurrent (Repeats Every Year)</option>
                  <option value="non-recurrent">Non-recurrent (One-time Event)</option>
                </select>
              </div>

              {specialDateDraftError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-red-600 shrink-0" />
                  {specialDateDraftError}
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddSpecialDateOpen(false)}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!specialDateDraft.date) {
                      setSpecialDateDraftError("Date is required.")
                      return
                    }
                    if (!specialDateDraft.noWorkSchedule) {
                      if (!specialDateDraft.from || !specialDateDraft.to) {
                        setSpecialDateDraftError("From and To are required unless No Work Schedule is selected.")
                        return
                      }
                      if (specialDateDraft.to <= specialDateDraft.from) {
                        setSpecialDateDraftError("To must be later than From.")
                        return
                      }
                    }

                    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
                    const newEntry: SpecialDateEntry = {
                      id,
                      date: specialDateDraft.date,
                      from: specialDateDraft.noWorkSchedule ? null : specialDateDraft.from,
                      to: specialDateDraft.noWorkSchedule ? null : specialDateDraft.to,
                      description: specialDateDraft.description,
                      section: specialDateDraft.section,
                    }
                    const next = [...specialDates, newEntry]
                    setSpecialDates(next)
                    saveSpecialDates(next)
                    setIsAddSpecialDateOpen(false)
                  }}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-5 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-700 focus:outline-none active:scale-95"
                >
                  <Plus className="size-3.5" />
                  Save Date
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
