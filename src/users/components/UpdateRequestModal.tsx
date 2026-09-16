import { X } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"

const RAW_API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api"
const API_URL = RAW_API_URL.replace(/\/$/, "").endsWith("/api")
  ? RAW_API_URL.replace(/\/$/, "")
  : `${RAW_API_URL.replace(/\/$/, "")}/api`

type UpdateRequestModalProps = {
  isOpen: boolean
  onClose: () => void
  onSubmit?: (payload: NewRequestPayload) => void
  initialPayload: Partial<NewRequestPayload>
  title?: string
}

export type NewRequestPayload = {
  fund: string
  section?: string
  fpp: string
  department: string
  amount: string
  contactNumber: string
  responsibilityCenter: string
  accountCode: string
  email: string
  requestedByName?: string
  requestedByDesignation?: string
  cashAvailabilityName?: string
  cashAvailabilityDesignation?: string
  approvedByName?: string
  approvedByDesignation?: string
  certifiedAName?: string
  certifiedAPosition?: string
  certifiedBName?: string
  certifiedBPosition?: string
  driveLink?: string
  purpose: string
  notes?: string
  prItems?: Array<{
    itemNo: string
    unit: string
    description: string
    quantity: string
    unitCost: string
    totalCost: string
  }>
  prEnabled: boolean
  obrEnabled: boolean
}

export default function UpdateRequestModal({
  isOpen,
  onClose,
  onSubmit,
  initialPayload,
  title = "Update Request",
}: UpdateRequestModalProps) {
  const PR_PAGE_BREAK_MARKER = "__PR_PAGE_BREAK__"

  const DEFAULT_CASH_AVAILABILITY_NAME = "ALICIA R. MAGPANTAY"
  const DEFAULT_CASH_AVAILABILITY_DESIGNATION = "Provincial Treasurer"
  const DEFAULT_APPROVED_BY_NAME = "JOSE ENRIQUE S. GARCIA III"
  const DEFAULT_APPROVED_BY_DESIGNATION = "Provincial Governor"
  const DEFAULT_BUDGET_UNIT_NAME = "EDUARDO D. BANZON"
  const DEFAULT_BUDGET_UNIT_POSITION = "Provincial Budget Officer"

  const defaultFormData = useMemo(
    () => ({
      fund: "",
      section: "",
      fpp: "",
      department: "",
      amount: "",
      contactNumber: "",
      responsibilityCenter: "",
      accountCode: "",
      email: "",
      driveLink: "",
      purpose: "",
      notes: "",
    }),
    []
  )

  const defaultTableRows = useMemo(
    () =>
      Array(28).fill({
        itemNo: "",
        unit: "",
        description: "",
        quantity: "",
        unitCost: "",
        totalCost: "",
      }),
    []
  )

  const [activeTab, setActiveTab] = useState<"pr" | "obr">("pr")
  const isAdmin = useMemo(() => {
    try {
      const raw = localStorage.getItem("user") || sessionStorage.getItem("user")
      const parsed = raw ? (JSON.parse(raw) as { role?: string } | null) : null
      return parsed?.role === "admin" || parsed?.role === "superadmin"
    } catch {
      return false
    }
  }, [isOpen])

  type OfficeOption = {
    name: string
    head?: string
    headDesignation?: string
    email?: string
  }
  const [officeOptions, setOfficeOptions] = useState<OfficeOption[]>([])
  const [officeOptionsLoading, setOfficeOptionsLoading] = useState(false)

  const [prEnabled, setPrEnabled] = useState(true)
  const [obrEnabled, setObrEnabled] = useState(true)

  const preparedByName = useMemo(() => {
    try {
      const raw = localStorage.getItem("user") || sessionStorage.getItem("user")
      const parsed = raw ? (JSON.parse(raw) as { fullName?: string; username?: string; role?: string } | null) : null
      const role = parsed?.role
      if (role === "admin" || role === "superadmin") return "System Administrator"
      const fullName = String(parsed?.fullName || '').trim()
      if (fullName && fullName.toLowerCase() !== 'admin') return fullName
      const username = String(parsed?.username || '').trim()
      if (!username || username.toLowerCase() === 'admin' || username.toLowerCase() === 'superadmin') {
        return "System Administrator"
      }
      return username
    } catch {
      return ""
    }
  }, [isOpen])
  const [deptHeadName, setDeptHeadName] = useState("")
  const [deptHeadDesignation, setDeptHeadDesignation] = useState("")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmUpdateOpen, setConfirmUpdateOpen] = useState(false)
  const [pendingSubmitPayload, setPendingSubmitPayload] = useState<NewRequestPayload | null>(null)
  const [formData, setFormData] = useState(defaultFormData)

  const [fundOptions, setFundOptions] = useState<string[]>([])
  const [fundOptionsLoading, setFundOptionsLoading] = useState(false)

  const lastAppliedInitialPayloadRef = useRef<string>("")

  // When modal closes, reset so next open re-applies initialPayload
  // (placed here so it runs before form-reset effect)

  const createEmptyPrPageRows = () =>
    Array.from({ length: 28 }).map(() => ({
      itemNo: "",
      unit: "",
      description: "",
      quantity: "",
      unitCost: "",
      totalCost: "",
    }))

  const [prPages, setPrPages] = useState<ReturnType<typeof createEmptyPrPageRows>[]>([createEmptyPrPageRows()])
  const [activePrPage, setActivePrPage] = useState(0)
  const tableRows = prPages[activePrPage] ?? prPages[0] ?? createEmptyPrPageRows()

  const prPagesLenRef = useRef(prPages.length)

  const prPageCount = prPages.length
  const isLastPrPage = activePrPage === prPageCount - 1

  const [prNo] = useState("")

  // OBR Representative state
  const [obrReps, setObrReps] = useState({
    leftName: "",
    leftPosition: "",
    rightName: "EDUARDO D. BANZON",
    rightPosition: "Provincial Budget Officer"
  })

  // PR Signatories state (Requested by / Cash Availability / Approved by)
  const [prSignatories, setPrSignatories] = useState({
    requestedByName: "",
    requestedByDesignation: "",
    cashAvailabilityName: "ALICIA R. MAGPANTAY",
    cashAvailabilityDesignation: "Provincial Treasurer",
    approvedByName: "JOSE ENRIQUE S. GARCIA III",
    approvedByDesignation: "Provincial Governor",
  })

  // Update mode: no draft support



  type TableCellEl = HTMLInputElement | HTMLTextAreaElement
  const tableInputRefs = useRef<Array<Array<TableCellEl | null>>>([])

  useEffect(() => {
    prPagesLenRef.current = prPages.length
    setActivePrPage((p) => Math.min(Math.max(0, p), Math.max(0, prPages.length - 1)))
  }, [prPages.length])

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleDepartmentChange = (val: string) => {
    handleInputChange("department", val)

    const match = officeOptions.find(
      (o) => o.name.trim().toLowerCase() === val.trim().toLowerCase()
    )

    if (match) {
      const head = String(match.head || "").trim()
      const desig = String(match.headDesignation || "").trim()
      const email = String(match.email || "").trim()

      if (head) setDeptHeadName(head)
      if (desig) setDeptHeadDesignation(desig)

      if (head || desig) {
        setPrSignatories((prev) => ({
          ...prev,
          requestedByName: head || prev.requestedByName,
          requestedByDesignation: desig || prev.requestedByDesignation,
        }))
        setObrReps((prev) => ({
          ...prev,
          leftName: head || prev.leftName,
          leftPosition: desig || prev.leftPosition,
        }))
      }

      if (email) {
        setFormData((prev) => ({
          ...prev,
          email: prev.email ? prev.email : email,
        }))
      }
    }
  }

  const getMissingDetails = () => {
    const missing: string[] = []

    if (!formData.fund.trim()) missing.push("Fund")
    if (!formData.fpp.trim()) missing.push("FPP")
    if (!formData.department.trim()) missing.push("Department")
    if (!formData.amount.trim()) missing.push("Amount")
    if (!formData.contactNumber.trim()) missing.push("Created by")
    if (!formData.responsibilityCenter.trim()) missing.push("Responsibility Center")
    if (!formData.accountCode.trim()) missing.push("Account Code")
    if (!formData.email.trim()) missing.push("Email Address")
    if (!formData.purpose.trim()) missing.push("Purpose")

    return missing
  }

  const handleTableChange = (index: number, field: string, value: string) => {
    if (activePrPage > 0 && index === 0) return
    setPrPages((prev) => {
      const next = prev.map((p) => p.map((r) => ({ ...r })))
      if (!next[activePrPage]) next[activePrPage] = createEmptyPrPageRows()
      next[activePrPage] = next[activePrPage].map((row, i) => (i === index ? { ...row, [field]: value } : row))
      return next
    })
  }

  const deletePrRow = (pageIndex: number, rowIndex: number) => {
    setPrPages((prev) => {
      const next = prev.map((p) => p.map((r) => ({ ...r })))
      const page = next[pageIndex] ?? createEmptyPrPageRows()
      const lastIdx = page.length - 1
      const startIdx = pageIndex > 0 ? 1 : 0

      // Only allow deleting normal item rows inside the inner bordered area
      // startIdx..lastIdx-1 are item rows; lastIdx is TOTAL row
      if (rowIndex < startIdx || rowIndex >= lastIdx) return prev

      const newPage = [...page.slice(0, rowIndex), ...page.slice(rowIndex + 1)]
      next[pageIndex] = newPage
      return next
    })
  }

  const isPrItemRowFilled = (row: {
    itemNo: string
    unit: string
    description: string
    quantity: string
    unitCost: string
    totalCost: string
  }) => {
    return Boolean(String(row.unit || "").trim())
  }

  const sanitizePrCellValue = (field: "unit" | "description" | "quantity" | "unitCost" | "totalCost", raw: string) => {
    const v = String(raw ?? "")
    if (field === "unit") return v.replace(/[0-9]/g, "")
    if (field === "quantity") return v.replace(/[^0-9.,]/g, "")
    if (field === "unitCost") return v.replace(/[^0-9.,]/g, "")
    if (field === "totalCost") return v.replace(/[^0-9.,-]/g, "")
    return v
  }

  const sanitizePrItemNo = (raw: string) => String(raw ?? "").replace(/[^0-9]/g, "")

  const handlePrTablePaste = (startRowIndex: number, startColIndex: 0 | 1 | 2 | 3 | 4 | 5, text: string) => {
    const effectiveStartRowIndex = activePrPage > 0 ? Math.max(1, startRowIndex) : startRowIndex
    const rowsText = String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")

    const lines = rowsText
      .split("\n")
      .filter((ln, idx, arr) => !(idx === arr.length - 1 && !ln.trim()))

    if (lines.length === 0) return

    const lastRowIndex = tableRows.length - 1
    const colFields: Array<"itemNo" | "unit" | "description" | "quantity" | "unitCost" | "totalCost"> = [
      "itemNo",
      "unit",
      "description",
      "quantity",
      "unitCost",
      "totalCost",
    ]

    const firstCells = lines[0]?.split("\t") || []
    const pastedLooksLikeStartsWithItemNo =
      startColIndex !== 0 &&
      firstCells.length >= 5 &&
      firstCells[0].trim() === sanitizePrItemNo(firstCells[0]) &&
      sanitizePrItemNo(firstCells[0]).length > 0

    const effectiveStartColIndex: 0 | 1 | 2 | 3 | 4 | 5 = pastedLooksLikeStartsWithItemNo ? 0 : startColIndex

    setPrPages((prev) => {
      const next = prev.map((p) => p.map((r) => ({ ...r })))
      if (!next[activePrPage]) next[activePrPage] = createEmptyPrPageRows()
      const pageRows = next[activePrPage]
      for (let r = 0; r < lines.length; r++) {
        const targetRow = effectiveStartRowIndex + r
        if (targetRow >= lastRowIndex) break

        const cells = lines[r].split("\t")

        if (effectiveStartColIndex === 0 && cells.length > colFields.length) {
          const itemNoRaw = cells[0] ?? ""
          const unitRaw = cells[1] ?? ""
          const qtyRaw = cells.at(-3) ?? ""
          const unitCostRaw = cells.at(-2) ?? ""
          const totalCostRaw = cells.at(-1) ?? ""
          const descRaw = cells.slice(2, Math.max(2, cells.length - 3)).join(" ").replace(/\s+/g, " ")

          pageRows[targetRow] = {
            ...pageRows[targetRow],
            itemNo: sanitizePrItemNo(itemNoRaw),
            unit: sanitizePrCellValue("unit", unitRaw),
            description: sanitizePrCellValue("description", descRaw),
            quantity: sanitizePrCellValue("quantity", qtyRaw),
            unitCost: sanitizePrCellValue("unitCost", unitCostRaw),
            totalCost: sanitizePrCellValue("totalCost", totalCostRaw),
          }
          continue
        }

        for (let c = 0; c < cells.length; c++) {
          const targetCol = effectiveStartColIndex + c
          if (targetCol >= colFields.length) break

          const field = colFields[targetCol]
          const currentValue = pageRows[targetRow]?.[field] ?? ""
          const raw = String(cells[c] ?? "")
          const sanitized =
            field === "itemNo"
              ? sanitizePrItemNo(raw)
              : sanitizePrCellValue(field as any, raw)
          pageRows[targetRow] = { ...pageRows[targetRow], [field]: sanitized || currentValue }
        }
      }
      return next
    })
  }

  const parseMoney = (value: string) => {
    const normalized = value.replace(/,/g, "").trim()
    const n = Number.parseFloat(normalized)
    return Number.isFinite(n) ? n : NaN
  }

  const computeRowTotal = (row: { quantity: string; unitCost: string; totalCost: string }) => {
    const pastedTotal = parseMoney(row.totalCost)
    if (Number.isFinite(pastedTotal)) return pastedTotal
    const qty = parseMoney(row.quantity)
    const unitCost = parseMoney(row.unitCost)
    return Number.isFinite(qty) && Number.isFinite(unitCost) ? qty * unitCost : 0
  }

  const formatMoneyNumber = (value: number) => {
    if (!Number.isFinite(value)) return ""
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const formatPesoInput = (raw: string, finalize: boolean) => {
    const s = String(raw || '').replace(/₱/g, '').trim()
    if (!s) return ''

    const cleaned = s.replace(/,/g, '').replace(/[^0-9.]/g, '')
    if (!cleaned) return ''

    const dotIdx = cleaned.indexOf('.')
    const intPartRaw = dotIdx >= 0 ? cleaned.slice(0, dotIdx) : cleaned
    const decPartRaw = dotIdx >= 0 ? cleaned.slice(dotIdx + 1) : ''

    const intPart = intPartRaw.replace(/^0+(?=\d)/, '')
    const formattedInt = intPart
      ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(intPart))
      : '0'

    if (!finalize) {
      const nextDec = decPartRaw.slice(0, 2)
      if (dotIdx >= 0) {
        return `₱ ${formattedInt}.${nextDec}`
      }
      return `₱ ${formattedInt}`
    }

    const n = Number.parseFloat(cleaned)
    if (!Number.isFinite(n)) return ''
    return `₱ ${formatMoneyNumber(n)}`
  }

  const focusTableCell = (rowIndex: number, colIndex: number) => {
    const el = tableInputRefs.current?.[rowIndex]?.[colIndex]
    if (el) el.focus()
  }

  const handleTableArrowNav = (e: KeyboardEvent<TableCellEl>, rowIndex: number, colIndex: number) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
    e.preventDefault()

    const lastRowIndex = tableRows.length - 1
    if (rowIndex === lastRowIndex) return

    if (e.key === "ArrowLeft") {
      focusTableCell(rowIndex, Math.max(0, colIndex - 1))
      return
    }

    if (e.key === "ArrowRight") {
      focusTableCell(rowIndex, Math.min(5, colIndex + 1))
      return
    }

    if (e.key === "ArrowUp") {
      const rawTarget = Math.max(0, rowIndex - 1)
      const targetRow = activePrPage > 0 && rawTarget === 0 ? 1 : rawTarget
      focusTableCell(targetRow, colIndex)
      return
    }

    if (e.key === "ArrowDown") {
      const targetRow = Math.min(lastRowIndex - 1, rowIndex + 1)
      focusTableCell(targetRow, colIndex)
    }
  }

  const lastTableRowIndex = tableRows.length - 1
  const pageItemsStartIndex = activePrPage > 0 ? 1 : 0
  const pageSubTotal = tableRows.slice(pageItemsStartIndex, lastTableRowIndex).reduce((sum, r) => sum + computeRowTotal(r), 0)

  const grandTotal = prPages.reduce((sum, page, pageIndex) => {
    const lastIdx = page.length - 1
    const startIdx = pageIndex > 0 ? 1 : 0
    const pageSum = page.slice(startIdx, lastIdx).reduce((s2, r) => s2 + computeRowTotal(r), 0)
    return sum + pageSum
  }, 0)

  const balancedForwardedAmount = prPages
    .slice(0, Math.max(0, activePrPage))
    .reduce((sum, page, pageIndex) => {
      const lastIdx = page.length - 1
      const startIdx = pageIndex > 0 ? 1 : 0
      const pageSum = page.slice(startIdx, lastIdx).reduce((s2, r) => s2 + computeRowTotal(r), 0)
      return sum + pageSum
    }, 0)
  const balancedForwardedText = balancedForwardedAmount ? `₱ ${formatMoneyNumber(balancedForwardedAmount)}` : ""

  const grandTotalText = grandTotal ? `₱ ${formatMoneyNumber(grandTotal)}` : ""
  const pageSubTotalText = pageSubTotal ? `₱ ${formatMoneyNumber(pageSubTotal)}` : ""

  const amountEditable = !prEnabled && obrEnabled

  useEffect(() => {
    if (!isOpen) return
      ; (async () => {
        let username = ""
        let office: string | null = null

        try {
          const rawUser = localStorage.getItem("user")
          const parsedUser = rawUser
            ? (JSON.parse(rawUser) as { username?: string; office?: string } | null)
            : null

          username = String(parsedUser?.username || "").trim()
          if (!username) return

          office =
            typeof parsedUser?.office === "string" && parsedUser.office.trim()
              ? parsedUser.office.trim()
              : null

          if (office) {
            setFormData((prev) => (prev.department.trim() ? prev : { ...prev, department: office as string }))
          }

          if (preparedByName) {
            setFormData((prev) => ({ ...prev, contactNumber: preparedByName }))
          }
        } catch {
          return
        }

        // Prefer official Office Head + Designation (Admin Offices) for Requested by
        // so it appears immediately when opening the modal.
        try {
          if (office) {
            const token = localStorage.getItem('token')
            const res = await fetch(`${API_URL}/offices`, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            })

            if (res.ok) {
              const data = (await res.json().catch(() => ({}))) as {
                offices?: Array<{ name?: string; head?: string; headDesignation?: string }>
              }

              const match = (data.offices || []).find((o) => {
                const name = String(o?.name || '').trim().toLowerCase()
                return name && name === String(office || '').trim().toLowerCase()
              })

              const head = String(match?.head || '').trim()
              const desig = String(match?.headDesignation || '').trim()
              if (head) setDeptHeadName(head)
              if (desig) setDeptHeadDesignation(desig)
              if (head || desig) {
                setObrReps((prev) => ({
                  ...prev,
                  leftName: String(prev.leftName || "").trim() ? prev.leftName : head || prev.leftName,
                  leftPosition: String(prev.leftPosition || "").trim() ? prev.leftPosition : desig || prev.leftPosition,
                }))
                setPrSignatories((prev) => ({
                  ...prev,
                  requestedByName: String(prev.requestedByName || "").trim() ? prev.requestedByName : head || prev.requestedByName,
                  requestedByDesignation: String(prev.requestedByDesignation || "").trim()
                    ? prev.requestedByDesignation
                    : desig || prev.requestedByDesignation,
                }))
              }
            }
          }
        } catch {
          // ignore
        }

        const settingsKey = `user_profile_settings:${username}`

        try {
          const token = localStorage.getItem('token')
          const res = await fetch(`${API_URL}/profile`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          })

          if (res.ok) {
            const data = (await res.json().catch(() => ({}))) as {
              profile?: {
                officeEmail?: string
                contactNumber?: string
                deptHead?: string
                deptHeadDesignation?: string
              }
            }

            const profile = data?.profile
            if (profile) {
              try {
                localStorage.setItem(
                  settingsKey,
                  JSON.stringify({
                    officeEmail: typeof profile.officeEmail === 'string' ? profile.officeEmail : '',
                    contactNumber: typeof profile.contactNumber === 'string' ? profile.contactNumber : '',
                    deptHead: typeof profile.deptHead === 'string' ? profile.deptHead : '',
                    deptHeadDesignation: typeof profile.deptHeadDesignation === 'string' ? profile.deptHeadDesignation : '',
                  })
                )
              } catch {
                // ignore
              }

              const nextEmail =
                typeof profile.officeEmail === "string" && profile.officeEmail.trim() ? profile.officeEmail.trim() : null
              const nextName = typeof profile.deptHead === "string" && profile.deptHead.trim() ? profile.deptHead.trim() : null
              const nextDesig =
                typeof profile.deptHeadDesignation === "string" && profile.deptHeadDesignation.trim()
                  ? profile.deptHeadDesignation.trim()
                  : null

              if (nextEmail) {
                setFormData((prev) => ({ ...prev, email: nextEmail }))
              }
              // contactNumber is used as "Created by" and should be the logged-in user's full name.
              // Keep it controlled by preparedByName rather than profile/local settings.
              setSubmitError(null)
              if (nextName) setDeptHeadName(nextName)
              if (nextDesig) setDeptHeadDesignation(nextDesig)

              if (nextName || nextDesig) {
                setObrReps((prev) => ({
                  ...prev,
                  leftName: String(prev.leftName || "").trim() ? prev.leftName : nextName ?? prev.leftName,
                  leftPosition: String(prev.leftPosition || "").trim() ? prev.leftPosition : nextDesig ?? prev.leftPosition,
                }))
                setPrSignatories((prev) => ({
                  ...prev,
                  requestedByName: String(prev.requestedByName || "").trim() ? prev.requestedByName : nextName ?? prev.requestedByName,
                  requestedByDesignation: String(prev.requestedByDesignation || "").trim()
                    ? prev.requestedByDesignation
                    : nextDesig ?? prev.requestedByDesignation,
                }))
              }
              return
            }
          }
        } catch {
          // ignore
        }

        try {
          const rawSettings = localStorage.getItem(settingsKey)
          if (!rawSettings) return

          const parsed = JSON.parse(rawSettings) as {
            officeEmail?: string
            contactNumber?: string
            deptHead?: string
            deptHeadDesignation?: string
          }

          const nextEmail =
            typeof parsed.officeEmail === "string" && parsed.officeEmail.trim() ? parsed.officeEmail.trim() : null

          const nextName = typeof parsed.deptHead === "string" && parsed.deptHead.trim() ? parsed.deptHead.trim() : null
          const nextDesig =
            typeof parsed.deptHeadDesignation === "string" && parsed.deptHeadDesignation.trim()
              ? parsed.deptHeadDesignation.trim()
              : null

          if (nextEmail) {
            setFormData((prev) => ({ ...prev, email: nextEmail }))
          }
          // contactNumber is used as "Created by" and should be the logged-in user's full name.
          // Keep it controlled by preparedByName rather than profile/local settings.
          setSubmitError(null)
          if (nextName) setDeptHeadName(nextName)
          if (nextDesig) setDeptHeadDesignation(nextDesig)

          if (nextName || nextDesig) {
            setObrReps((prev) => ({
              ...prev,
              leftName: String(prev.leftName || "").trim() ? prev.leftName : nextName ?? prev.leftName,
              leftPosition: String(prev.leftPosition || "").trim() ? prev.leftPosition : nextDesig ?? prev.leftPosition,
            }))
            setPrSignatories((prev) => ({
              ...prev,
              requestedByName: String(prev.requestedByName || "").trim() ? prev.requestedByName : nextName ?? prev.requestedByName,
              requestedByDesignation: String(prev.requestedByDesignation || "").trim()
                ? prev.requestedByDesignation
                : nextDesig ?? prev.requestedByDesignation,
            }))
          }
        } catch {
          // ignore
        }
      })()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
      ; (async () => {
        try {
          setFundOptionsLoading(true)
          setOfficeOptionsLoading(true)
          const token = localStorage.getItem("token") || sessionStorage.getItem("token")
          const headers = token ? { Authorization: `Bearer ${token}` } : undefined

          const [fundRes, offRes, depRes] = await Promise.allSettled([
            fetch(`${API_URL}/source-of-funds`, { headers }),
            fetch(`${API_URL}/offices`, { headers }),
            fetch(`${API_URL}/departments`, { headers }),
          ])

          if (fundRes.status === "fulfilled" && fundRes.value.ok) {
            const data = await fundRes.value.json().catch(() => ({}))
            const list = Array.isArray((data as any)?.sourceOfFunds) ? (data as any).sourceOfFunds : []
            const names: string[] = list
              .filter((s: any) => !s || s.status !== "archived")
              .map((s: any) => String(s?.name || "").trim())
              .filter((n: string) => Boolean(n))

            const deduped: string[] = Array.from(new Set<string>(names))
            deduped.sort((a, b) => a.localeCompare(b))
            setFundOptions(deduped)
          }

          const optionsMap = new Map<string, OfficeOption>()
          if (offRes.status === "fulfilled" && offRes.value.ok) {
            const offData = await offRes.value.json().catch(() => ({}))
            const list = Array.isArray(offData?.offices) ? offData.offices : []
            for (const o of list) {
              if (o?.status === "archived") continue
              const name = String(o?.name || "").trim()
              if (!name) continue
              optionsMap.set(name.toLowerCase(), {
                name,
                head: String(o?.head || "").trim(),
                headDesignation: String(o?.headDesignation || "").trim(),
                email: String(o?.email || "").trim(),
              })
            }
          }

          if (depRes.status === "fulfilled" && depRes.value.ok) {
            const depData = await depRes.value.json().catch(() => ({}))
            const list = Array.isArray(depData?.departments) ? depData.departments : []
            for (const d of list) {
              if (d?.status === "archived") continue
              const name = String(d?.name || "").trim()
              if (!name) continue
              if (!optionsMap.has(name.toLowerCase())) {
                optionsMap.set(name.toLowerCase(), {
                  name,
                  head: "",
                  headDesignation: "",
                  email: "",
                })
              }
            }
          }

          const sortedOffices = Array.from(optionsMap.values()).sort((a, b) => a.name.localeCompare(b.name))
          setOfficeOptions(sortedOffices)
        } catch {
          // ignore
        } finally {
          setFundOptionsLoading(false)
          setOfficeOptionsLoading(false)
        }
      })()
  }, [isOpen])


  useEffect(() => {
    if (!isOpen) return
    if (lastAppliedInitialPayloadRef.current) return

    setActiveTab("pr")
    setPrEnabled(true)
    setObrEnabled(true)

    try {
      const rawUser = localStorage.getItem("user") || sessionStorage.getItem("user")
      const parsedUser = rawUser
        ? (JSON.parse(rawUser) as { username?: string; office?: string; role?: string } | null)
        : null

      const username = parsedUser?.username
      const role = parsedUser?.role
      const isAdminUser = role === "admin" || role === "superadmin"
      const office = typeof parsedUser?.office === "string" && parsedUser.office.trim() ? parsedUser.office.trim() : ""

      let next = { ...defaultFormData }
      if (!isAdminUser && office) next.department = office
      if (preparedByName) next.contactNumber = preparedByName

      if (username) {
        const rawSettings = localStorage.getItem(`user_profile_settings:${username}`)
        if (rawSettings) {
          const parsed = JSON.parse(rawSettings) as { officeEmail?: string; contactNumber?: string }
          const nextEmail =
            typeof parsed.officeEmail === "string" && parsed.officeEmail.trim() ? parsed.officeEmail.trim() : null

          if (nextEmail) next.email = nextEmail
        }
      }

      setFormData(next)
    } catch {
      setFormData({ ...defaultFormData, contactNumber: preparedByName || "" })
    }
    setPrPages([createEmptyPrPageRows()])
    setActivePrPage(0)
    setSubmitError(null)
  }, [defaultFormData, defaultTableRows, isOpen, preparedByName])

  // Reset when modal closes so initialPayload is re-applied on next open
  useEffect(() => {
    if (isOpen) return
    lastAppliedInitialPayloadRef.current = ""
  }, [isOpen])

  // Apply initialPayload into form state whenever it changes
  useEffect(() => {
    if (!isOpen) return
    if (!initialPayload) return
    const sig = (() => { try { return JSON.stringify(initialPayload) } catch { return "" } })()
    if (sig && lastAppliedInitialPayloadRef.current === sig) return
    lastAppliedInitialPayloadRef.current = sig
    setFormData((prev) => ({
      ...prev,
      fund: typeof initialPayload.fund === "string" ? initialPayload.fund : prev.fund,
      section: typeof initialPayload.section === "string" ? initialPayload.section : prev.section,
      fpp: typeof initialPayload.fpp === "string" ? initialPayload.fpp : prev.fpp,
      department: typeof initialPayload.department === "string" ? initialPayload.department : prev.department,
      amount: typeof initialPayload.amount === "string" ? initialPayload.amount : prev.amount,
      contactNumber: preparedByName || prev.contactNumber,
      responsibilityCenter: typeof initialPayload.responsibilityCenter === "string" ? initialPayload.responsibilityCenter : prev.responsibilityCenter,
      accountCode: typeof initialPayload.accountCode === "string" ? initialPayload.accountCode : prev.accountCode,
      email: typeof initialPayload.email === "string" ? initialPayload.email : prev.email,
      driveLink: typeof initialPayload.driveLink === "string" ? initialPayload.driveLink : prev.driveLink,
      purpose: typeof initialPayload.purpose === "string" ? initialPayload.purpose : prev.purpose,
      notes: typeof initialPayload.notes === "string" ? initialPayload.notes : prev.notes,
    }))
    if (typeof initialPayload.prEnabled === "boolean") setPrEnabled(initialPayload.prEnabled)
    if (typeof initialPayload.obrEnabled === "boolean") setObrEnabled(initialPayload.obrEnabled)
    setActiveTab("pr")
    if (Array.isArray(initialPayload.prItems)) {
      const payloadItems = initialPayload.prItems
      const hasMarkers = payloadItems.some((it: any) => String(it?.description || "").trim() === PR_PAGE_BREAK_MARKER)
      const pagesItems = hasMarkers
        ? payloadItems.reduce((acc: any[][], it: any) => {
          if (String(it?.description || "").trim() === PR_PAGE_BREAK_MARKER) acc.push([])
          else acc[acc.length - 1].push(it)
          return acc
        }, [[]])
        : [payloadItems]
      const nextPages = Array.from({ length: Math.max(1, pagesItems.length) }).map(() => createEmptyPrPageRows())
      pagesItems.forEach((pageItems: any[], pageIdx: number) => {
        const startRowIdx = pageIdx > 0 ? 1 : 0
        pageItems.slice(0, pageIdx > 0 ? 26 : 27).forEach((it: any, i: number) => {
          nextPages[pageIdx][startRowIdx + i] = { itemNo: "", unit: String(it?.unit || ""), description: String(it?.description || ""), quantity: String(it?.quantity || ""), unitCost: String(it?.unitCost || ""), totalCost: String(it?.totalCost || "") }
        })
      })
      setPrPages(nextPages); setActivePrPage(0)
    }
    setPrSignatories((prev) => ({
      ...prev,
      requestedByName: typeof initialPayload.requestedByName === "string" && initialPayload.requestedByName.trim() ? initialPayload.requestedByName : prev.requestedByName,
      requestedByDesignation: typeof initialPayload.requestedByDesignation === "string" && initialPayload.requestedByDesignation.trim() ? initialPayload.requestedByDesignation : prev.requestedByDesignation,
      cashAvailabilityName: typeof initialPayload.cashAvailabilityName === "string" && initialPayload.cashAvailabilityName.trim() ? initialPayload.cashAvailabilityName : prev.cashAvailabilityName,
      cashAvailabilityDesignation: typeof initialPayload.cashAvailabilityDesignation === "string" && initialPayload.cashAvailabilityDesignation.trim() ? initialPayload.cashAvailabilityDesignation : prev.cashAvailabilityDesignation,
      approvedByName: typeof initialPayload.approvedByName === "string" && initialPayload.approvedByName.trim() ? initialPayload.approvedByName : prev.approvedByName,
      approvedByDesignation: typeof initialPayload.approvedByDesignation === "string" && initialPayload.approvedByDesignation.trim() ? initialPayload.approvedByDesignation : prev.approvedByDesignation,
    }))
    setObrReps((prev) => ({
      ...prev,
      leftName: typeof initialPayload.certifiedAName === "string" && initialPayload.certifiedAName.trim() ? initialPayload.certifiedAName : prev.leftName,
      leftPosition: typeof initialPayload.certifiedAPosition === "string" && initialPayload.certifiedAPosition.trim() ? initialPayload.certifiedAPosition : prev.leftPosition,
      rightName: typeof initialPayload.certifiedBName === "string" && initialPayload.certifiedBName.trim() ? initialPayload.certifiedBName : prev.rightName,
      rightPosition: typeof initialPayload.certifiedBPosition === "string" && initialPayload.certifiedBPosition.trim() ? initialPayload.certifiedBPosition : prev.rightPosition,
    }))
    setSubmitError(null)
  }, [initialPayload, isOpen])



  useEffect(() => {
    if (!isOpen) return
    if (!prEnabled) return
    setFormData((prev) => ({ ...prev, amount: grandTotalText }))
  }, [grandTotalText, isOpen, prEnabled])

  useEffect(() => {
    if (!submitError) return
    const t = window.setTimeout(() => setSubmitError(null), 3500)
    return () => window.clearTimeout(t)
  }, [submitError])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) onClose()
      }}
    >
      {submitError ? (
        <div className="fixed right-3 top-3 z-60 w-[min(380px,calc(100vw-1.5rem))] rounded-md border border-red-200 bg-white px-3 py-2 text-xs text-red-700 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 wrap-break-word">{submitError}</div>
            <button
              type="button"
              onClick={() => setSubmitError(null)}
              className="inline-flex size-5 items-center justify-center rounded text-red-600 hover:bg-red-50"
              aria-label="Close"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      ) : null}
      <div className="flex h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        </div>

        {/* Scrollable Content + Side Panel */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Form Grid */}
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Row 1 */}
              <div className="space-y-1.5">
                <label htmlFor="new-request-fund" className="text-xs font-semibold text-slate-700">
                  Fund
                </label>
                <select
                  id="new-request-fund"
                  value={formData.fund}
                  onChange={(e) => handleInputChange("fund", e.target.value)}
                  required
                  className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm focus:border-sky-500 focus:outline-none"
                >
                  <option value="">--</option>
                  {fundOptionsLoading ? <option value="">Loading...</option> : null}
                  {formData.fund && !fundOptions.includes(formData.fund) ? (
                    <option value={formData.fund}>{formData.fund}</option>
                  ) : null}
                  {fundOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="new-request-section" className="text-xs font-semibold text-slate-700">
                  Section
                </label>
                <input
                  id="new-request-section"
                  type="text"
                  value={formData.section}
                  onChange={(e) => handleInputChange("section", e.target.value)}
                  className="h-9 w-full rounded border border-slate-300 bg-white px-3 text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="new-request-fpp" className="text-xs font-semibold text-slate-700">
                  FPP
                </label>
                <input
                  id="new-request-fpp"
                  type="text"
                  value={formData.fpp}
                  onChange={(e) => handleInputChange("fpp", e.target.value)}
                  required
                  className="h-9 w-full rounded border border-slate-300 bg-white px-3 text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>

              {/* Row 2 */}
              <div className="space-y-1.5">
                <label htmlFor="new-request-department" className="text-xs font-semibold text-slate-700">
                  Department
                </label>
                {isAdmin ? (
                  <div className="relative">
                    <input
                      id="new-request-department"
                      type="text"
                      list="new-request-department-list"
                      value={formData.department}
                      onChange={(e) => handleDepartmentChange(e.target.value)}
                      placeholder="Select or type department..."
                      required
                      className="h-9 w-full rounded border border-slate-300 bg-white px-3 text-sm focus:border-sky-500 focus:outline-none"
                    />
                    <datalist id="new-request-department-list">
                      {officeOptions.map((o) => (
                        <option key={o.name} value={o.name}>
                          {o.head ? `${o.name} (Head: ${o.head})` : o.name}
                        </option>
                      ))}
                    </datalist>
                  </div>
                ) : (
                  <input
                    id="new-request-department"
                    type="text"
                    value={formData.department}
                    readOnly
                    required
                    className="h-9 w-full rounded border border-slate-300 bg-slate-50 px-3 text-sm text-slate-600 focus:outline-none"
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="new-request-amount" className="text-xs font-semibold text-slate-700">
                  Amount
                </label>
                <input
                  id="new-request-amount"
                  type="text"
                  value={formData.amount}
                  readOnly={!amountEditable}
                  onChange={(e) => {
                    if (!amountEditable) return
                    handleInputChange("amount", formatPesoInput(e.target.value, false))
                  }}
                  onBlur={() => {
                    if (!amountEditable) return
                    setFormData((prev) => ({ ...prev, amount: formatPesoInput(prev.amount, true) }))
                  }}
                  required
                  className={`h-9 w-full rounded border border-slate-300 px-3 text-sm focus:border-sky-500 focus:outline-none ${amountEditable ? "bg-white" : "bg-slate-50 text-slate-600"
                    }`}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="new-request-contact-number" className="text-xs font-semibold text-slate-700">
                  Created by
                </label>
                <input
                  id="new-request-contact-number"
                  type="text"
                  value={formData.contactNumber}
                  readOnly
                  required
                  className="h-9 w-full rounded border border-slate-300 bg-slate-50 px-3 text-sm text-slate-600 focus:outline-none"
                />
              </div>

              {/* Row 3 */}
              <div className="space-y-1.5">
                <label
                  htmlFor="new-request-responsibility-center"
                  className="text-xs font-semibold text-slate-700"
                >
                  Responsibility Center
                </label>
                <input
                  id="new-request-responsibility-center"
                  type="text"
                  value={formData.responsibilityCenter}
                  onChange={(e) => handleInputChange("responsibilityCenter", e.target.value)}
                  required
                  className="h-9 w-full rounded border border-slate-300 bg-white px-3 text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="new-request-account-code" className="text-xs font-semibold text-slate-700">
                  Account Code
                </label>
                <input
                  id="new-request-account-code"
                  type="text"
                  value={formData.accountCode}
                  onChange={(e) => handleInputChange("accountCode", e.target.value)}
                  required
                  className="h-9 w-full rounded border border-slate-300 bg-white px-3 text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="new-request-email" className="text-xs font-semibold text-slate-700">
                  Email Address
                </label>
                <input
                  id="new-request-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  required
                  className="h-9 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Drive Link */}
            <div className="mt-4 space-y-1.5">
              <label htmlFor="new-request-drive-link" className="text-xs font-semibold text-slate-700">
                Drive Link{" "}
                <span className="font-normal text-sky-500">(For other attachments to be checked.)</span>
              </label>
              <input
                id="new-request-drive-link"
                type="text"
                value={formData.driveLink}
                onChange={(e) => handleInputChange("driveLink", e.target.value)}
                className="h-9 w-full rounded border border-slate-300 bg-white px-3 text-sm focus:border-sky-500 focus:outline-none"
              />
            </div>

            {/* Purpose */}
            <div className="mt-4 space-y-1.5">
              <label htmlFor="new-request-purpose" className="text-xs font-semibold text-slate-700">
                Purpose
              </label>
              <textarea
                id="new-request-purpose"
                value={formData.purpose}
                onChange={(e) => handleInputChange("purpose", e.target.value)}
                rows={2}
                required
                className="h-16 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
              />
            </div>

            {/* Notes for OBR */}
            <div className="mt-4 space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Notes (for OBR)</label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleInputChange("notes", e.target.value)}
                rows={2}
                className="h-16 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                placeholder="Additional notes to appear in OBR particulars..."
              />
            </div>

            {/* PR/OBR Toggles */}
            <div className="mt-4 flex items-center gap-6 rounded border border-slate-300 p-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPrEnabled((prev) => {
                      const next = !prev
                      if (!next && !obrEnabled) return true
                      if (next) setActiveTab("pr")
                      else if (activeTab === "pr" && obrEnabled) setActiveTab("obr")
                      return next
                    })
                  }}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${prEnabled ? "bg-sky-500" : "bg-slate-300"
                    }`}
                >
                  <span
                    className={`inline-block size-4 rounded-full bg-white transition ${prEnabled ? "translate-x-5" : "translate-x-1"
                      }`}
                  />
                </button>
                <span className="text-sm font-medium text-slate-700">PR</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setObrEnabled((prev) => {
                      const next = !prev
                      if (!next && !prEnabled) return true
                      if (next) setActiveTab("obr")
                      else if (activeTab === "obr" && prEnabled) setActiveTab("pr")
                      return next
                    })
                  }}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${obrEnabled ? "bg-sky-500" : "bg-slate-300"
                    }`}
                >
                  <span
                    className={`inline-block size-4 rounded-full bg-white transition ${obrEnabled ? "translate-x-5" : "translate-x-1"
                      }`}
                  />
                </button>
                <span className="text-sm font-medium text-slate-700">OBR</span>
              </div>
            </div>

            {/* PR/OBR Tabs */}
            <div className="mt-4 border-b border-slate-200">
              <div className="flex items-end justify-between gap-3">
                <div className="flex">
                  <button
                    type="button"
                    disabled={!prEnabled}
                    onClick={() => setActiveTab("pr")}
                    className={`px-4 py-2 text-sm font-medium ${!prEnabled
                      ? "cursor-not-allowed text-slate-300"
                      : activeTab === "pr"
                        ? "border-b-2 border-sky-500 text-sky-600"
                        : "text-slate-600 hover:text-slate-800"
                      }`}
                  >
                    PR
                  </button>
                  <button
                    type="button"
                    disabled={!obrEnabled}
                    onClick={() => setActiveTab("obr")}
                    className={`px-4 py-2 text-sm font-medium ${!obrEnabled
                      ? "cursor-not-allowed text-slate-300"
                      : activeTab === "obr"
                        ? "border-b-2 border-sky-500 text-sky-600"
                        : "text-slate-600 hover:text-slate-800"
                      }`}
                  >
                    OBR
                  </button>
                </div>

                {activeTab === "pr" && prEnabled ? (
                  <div className="flex items-center gap-2 pb-1">
                    <button
                      type="button"
                      onClick={() => setActivePrPage((p) => Math.max(0, p - 1))}
                      disabled={activePrPage === 0}
                      className="inline-flex h-7 items-center justify-center rounded border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivePrPage((p) => Math.min(prPageCount - 1, p + 1))}
                      disabled={activePrPage >= prPageCount - 1}
                      className="inline-flex h-7 items-center justify-center rounded border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPrPages((prev) => {
                          const next = prev.map((p) => p.map((r) => ({ ...r })))
                          const page = next[activePrPage] ?? createEmptyPrPageRows()
                          const lastIdx = page.length - 1

                          // Insert new empty item row just before TOTAL row
                          const newRow = {
                            itemNo: "",
                            unit: "",
                            description: "",
                            quantity: "",
                            unitCost: "",
                            totalCost: "",
                          }

                          const newPage = [...page.slice(0, lastIdx), newRow, page[lastIdx]]
                          next[activePrPage] = newPage

                          // Focus the new row's Item No cell after state update
                          const newRowIndex = newPage.length - 2
                          setTimeout(() => {
                            focusTableCell(newRowIndex, 0)
                          }, 0)

                          return next
                        })
                      }}
                      className="inline-flex h-7 items-center justify-center rounded border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Add Row
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPrPages((prev) => {
                          return [...prev, createEmptyPrPageRows()]
                        })
                        setActivePrPage(prPagesLenRef.current)
                        tableInputRefs.current = []
                      }}
                      className="inline-flex h-7 items-center justify-center rounded bg-sky-600 px-2 text-xs font-medium text-white transition hover:bg-sky-700"
                    >
                      Add Page
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Table Editor Area - Conditional PR/OBR */}
            <div className="mt-4">
              {/* Table Container */}
              <div className="h-[720px] overflow-auto no-scrollbar">
                {activeTab === "pr" && prEnabled ? (
                  /* PR Form - Interactive */
                  <div className="border border-black relative min-h-[600px] p-4 max-w-2xl mx-auto" style={{ fontFamily: 'Times New Roman, Times, serif' }}>
                    <div className="absolute right-2 top-2 text-xs font-bold bg-white px-1">
                      {prPageCount > 0 ? `${activePrPage + 1} of ${prPageCount}` : "1 of 1"}
                    </div>
                    <h3 className="text-center text-lg font-bold uppercase tracking-wide">Purchase Request</h3>
                    <div className="mt-2 flex justify-between text-xs font-bold">
                      <span>LGU: <span className="underline">PROVINCIAL GOVERNMENT OF BATAAN</span></span>
                      <span className="pr-2">
                        FUND:{" "}
                        <span className="inline-block w-[140px] text-left">{formData.fund || "\u00A0"}</span>
                      </span>
                    </div>

                    <div className="mt-2 border border-black min-h-[500px] p-0 mb-1">
                      <div className="grid grid-cols-[120px_1fr_120px] text-xs font-bold">
                        <div className="border-r border-black p-1">Department: {formData.department || ""}</div>
                        <div className="p-1">PR No.: {prNo || ""}</div>
                        <div className="p-1 pl-2">Date:</div>
                      </div>
                      <div className="grid grid-cols-[120px_1fr_120px] border-b border-black text-xs font-bold">
                        <div className="border-r border-black p-1">Section: {formData.section || ""}</div>
                        <div className="p-1">FPP: {formData.fpp || ""}</div>
                        <div className="p-1" />
                      </div>

                      <div className="grid grid-cols-[60px_60px_1fr_70px_80px_80px_32px] border-b border-black text-xs font-bold text-center">
                        <div className="border-r border-black py-1">Item No.</div>
                        <div className="border-r border-black py-1">Unit</div>
                        <div className="border-r border-black py-1">Item Description</div>
                        <div className="border-r border-black py-1">Quantity</div>
                        <div className="border-r border-black py-1">Unit Cost</div>
                        <div className="border-r border-black py-1">Total Cost</div>
                        <div className="py-1">&nbsp;</div>
                      </div>

                      {tableRows.map((row, index) => {
                        const isTotalRow = index === tableRows.length - 1
                        const isCarryRow = activePrPage > 0 && index === 0
                        const qty = parseMoney(row.quantity)
                        const unitCost = parseMoney(row.unitCost)
                        const pastedLineTotal = parseMoney(row.totalCost)
                        const computedTotal = Number.isFinite(qty) && Number.isFinite(unitCost) ? qty * unitCost : NaN
                        const rowTotal = Number.isFinite(pastedLineTotal) ? pastedLineTotal : computedTotal
                        const totalText = Number.isFinite(rowTotal) ? `₱ ${formatMoneyNumber(rowTotal)}` : ""
                        const autoItemNo = (() => {
                          if (isTotalRow || isCarryRow || !isPrItemRowFilled(row)) return ""

                          let count = 0
                          for (let p = 0; p < prPages.length; p++) {
                            const page = prPages[p]
                            const lastIdx = page.length - 1
                            const startIdx = p > 0 ? 1 : 0
                            const endExclusive = p === activePrPage ? index + 1 : lastIdx
                            const safeEnd = Math.min(lastIdx, Math.max(startIdx, endExclusive))
                            for (let r = startIdx; r < safeEnd; r++) {
                              if (isPrItemRowFilled(page[r])) count++
                            }
                            if (p === activePrPage) break
                          }

                          return count ? String(count) : ""
                        })()

                        const localAutoItemNo = (() => {
                          if (isTotalRow || isCarryRow || !isPrItemRowFilled(row)) return ""
                          return String(
                            tableRows
                              .slice(0, index + 1)
                              .filter((r, i) => {
                                if (i === tableRows.length - 1) return false
                                if (activePrPage > 0 && i === 0) return false
                                return isPrItemRowFilled(r)
                              }).length
                          )
                        })()

                        const storedItemNo = String(row.itemNo || "").trim()
                        const useGlobalAuto = storedItemNo && localAutoItemNo && storedItemNo === localAutoItemNo

                        const displayItemNo =
                          isTotalRow ? "" : storedItemNo ? (useGlobalAuto ? autoItemNo : storedItemNo) : autoItemNo

                        return (
                          <div
                            key={index}
                            className="grid grid-cols-[60px_60px_1fr_70px_80px_80px_32px] border-b border-black last:border-b-0"
                          >
                            <div className="border-r border-black min-h-5 flex items-center justify-center text-xs">
                              {isTotalRow || isCarryRow ? null : (
                                <input
                                  value={displayItemNo}
                                  onChange={(e) => handleTableChange(index, "itemNo", sanitizePrItemNo(e.target.value))}
                                  onPaste={(e) => {
                                    const txt = e.clipboardData?.getData("text") || ""
                                    if (!txt.includes("\t") && !txt.includes("\n")) return
                                    e.preventDefault()
                                    handlePrTablePaste(index, 0, txt)
                                  }}
                                  ref={(el) => {
                                    tableInputRefs.current[index] = tableInputRefs.current[index] || []
                                    tableInputRefs.current[index][0] = el
                                  }}
                                  onKeyDown={(e) => handleTableArrowNav(e, index, 0)}
                                  className="h-full w-full bg-transparent text-xs text-center tabular-nums focus:outline-none"
                                />
                              )}
                            </div>

                            <div className="border-r border-black min-h-5 px-1">
                              {isTotalRow || isCarryRow ? null : (
                                <input
                                  value={row.unit}
                                  onChange={(e) => handleTableChange(index, "unit", e.target.value.replace(/[0-9]/g, ""))}
                                  onPaste={(e) => {
                                    const txt = e.clipboardData?.getData("text") || ""
                                    if (!txt.includes("\t") && !txt.includes("\n")) return
                                    e.preventDefault()
                                    handlePrTablePaste(index, 1, txt)
                                  }}
                                  ref={(el) => {
                                    tableInputRefs.current[index] = tableInputRefs.current[index] || []
                                    tableInputRefs.current[index][1] = el
                                  }}
                                  onKeyDown={(e) => handleTableArrowNav(e, index, 1)}
                                  className="h-full w-full bg-transparent text-xs text-center focus:outline-none"
                                />
                              )}
                            </div>

                            <div
                              className={
                                isTotalRow
                                  ? "border-r border-black min-h-5 px-1 flex items-center justify-center font-bold"
                                  : "border-r border-black min-h-5 px-1 font-bold min-w-0"
                              }
                            >
                              {isTotalRow ? (
                                isLastPrPage ? "TOTAL" : "SUB-TOTAL"
                              ) : isCarryRow ? (
                                <div className="h-full w-full flex items-center justify-center text-xs font-bold">BALANCED FORWARDED</div>
                              ) : (
                                <textarea
                                  rows={1}
                                  value={row.description}
                                  onChange={(e) => handleTableChange(index, "description", e.target.value)}
                                  onPaste={(e) => {
                                    const txt = e.clipboardData?.getData("text") || ""
                                    if (!txt.includes("\t") && !txt.includes("\n")) return
                                    e.preventDefault()
                                    handlePrTablePaste(index, 2, txt)
                                  }}
                                  ref={(el) => {
                                    tableInputRefs.current[index] = tableInputRefs.current[index] || []
                                    tableInputRefs.current[index][2] = el
                                  }}
                                  onKeyDown={(e) => handleTableArrowNav(e, index, 2)}
                                  onInput={(e) => {
                                    const el = e.currentTarget
                                    el.style.height = "auto"
                                    el.style.height = `${el.scrollHeight}px`
                                  }}
                                  className="w-full min-w-0 bg-transparent text-xs text-left font-normal leading-tight focus:outline-none resize-none wrap-break-word overflow-hidden"
                                />
                              )}
                            </div>

                            <div className="border-r border-black min-h-5 px-1">
                              {isTotalRow || isCarryRow ? null : (
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={row.quantity}
                                  onChange={(e) => handleTableChange(index, "quantity", e.target.value.replace(/[^0-9.,]/g, ""))}
                                  onPaste={(e) => {
                                    const txt = e.clipboardData?.getData("text") || ""
                                    if (!txt.includes("\t") && !txt.includes("\n")) return
                                    e.preventDefault()
                                    handlePrTablePaste(index, 3, txt)
                                  }}
                                  ref={(el) => {
                                    tableInputRefs.current[index] = tableInputRefs.current[index] || []
                                    tableInputRefs.current[index][3] = el
                                  }}
                                  onKeyDown={(e) => handleTableArrowNav(e, index, 3)}
                                  className="h-full w-full bg-transparent text-xs text-center tabular-nums focus:outline-none"
                                />
                              )}
                            </div>

                            <div className="border-r border-black min-h-5 px-1">
                              {isTotalRow || isCarryRow ? null : (
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={row.unitCost}
                                  onChange={(e) => handleTableChange(index, "unitCost", e.target.value.replace(/[^0-9.,]/g, ""))}
                                  onPaste={(e) => {
                                    const txt = e.clipboardData?.getData("text") || ""
                                    if (!txt.includes("\t") && !txt.includes("\n")) return
                                    e.preventDefault()
                                    handlePrTablePaste(index, 4, txt)
                                  }}
                                  onBlur={() => {
                                    const n = parseMoney(row.unitCost)
                                    if (Number.isFinite(n)) handleTableChange(index, "unitCost", formatMoneyNumber(n))
                                  }}
                                  ref={(el) => {
                                    tableInputRefs.current[index] = tableInputRefs.current[index] || []
                                    tableInputRefs.current[index][4] = el
                                  }}
                                  onKeyDown={(e) => handleTableArrowNav(e, index, 4)}
                                  className="h-full w-full bg-transparent text-xs text-center tabular-nums focus:outline-none"
                                />
                              )}
                            </div>

                            <div className="border-r border-black min-h-5 px-1 flex items-center justify-center text-xs tabular-nums text-black">
                              {isTotalRow ? (
                                isLastPrPage ? grandTotalText : pageSubTotalText
                              ) : isCarryRow ? (
                                balancedForwardedText
                              ) : row.totalCost ? (
                                <span className="text-black">₱ {row.totalCost}</span>
                              ) : totalText ? (
                                <span className="text-black">{totalText}</span>
                              ) : (
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={row.totalCost}
                                  onChange={(e) => handleTableChange(index, "totalCost", e.target.value.replace(/[^0-9.,-]/g, ""))}
                                  onPaste={(e) => {
                                    const txt = e.clipboardData?.getData("text") || ""
                                    if (!txt.includes("\t") && !txt.includes("\n")) return
                                    e.preventDefault()
                                    handlePrTablePaste(index, 5, txt)
                                  }}
                                  ref={(el) => {
                                    tableInputRefs.current[index] = tableInputRefs.current[index] || []
                                    tableInputRefs.current[index][5] = el
                                  }}
                                  onKeyDown={(e) => handleTableArrowNav(e, index, 5)}
                                  className="h-full w-full bg-transparent text-xs text-center tabular-nums focus:outline-none text-black"
                                />
                              )}
                            </div>

                            {/* Delete row button */}
                            <div className="min-h-5 flex items-center justify-center">
                              {!isTotalRow && !isCarryRow ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    deletePrRow(activePrPage, index)
                                  }}
                                  className="inline-flex items-center justify-center rounded bg-rose-600 px-1 text-[10px] font-bold text-white hover:bg-rose-700"
                                  title="Delete row"
                                >
                                  X
                                </button>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="grid grid-cols-[70px_1fr] gap-2 text-xs">
                      <div className="font-bold">Purpose:</div>
                      <div className="min-h-12 whitespace-pre-wrap wrap-break-word">{formData.purpose || ""}</div>
                    </div>

                    <div className="border border-black p-0">
                      <div className="grid grid-cols-[80px_1fr_1fr_1fr] text-xs">
                        <div className="border-r border-black row-span-5 relative whitespace-nowrap p-0">
                          <div className="absolute bottom-0 left-1">
                            <div className="text-left">Signature:</div>
                            <div className="text-left">Printed Name:</div>
                            <div className="text-left">Designation</div>
                          </div>
                        </div>

                        <div className="border-r border-black py-1 text-center">Requested by:</div>
                        <div className="border-r border-black py-1 text-center">Cash Availability:</div>
                        <div className="py-1 text-center">Approved by:</div>

                        <div className="border-r border-black border-b border-black row-span-2 h-8" />
                        <div className="border-r border-black border-b border-black row-span-2 h-8" />
                        <div className="border-b border-black row-span-2 h-8" />

                        <div className="border-r border-black h-[18px] px-0.5 text-center text-[10px] font-bold leading-[9px] flex items-center justify-center whitespace-normal wrap-break-word">
                          {prSignatories.requestedByName || deptHeadName}
                        </div>
                        <div className="border-r border-black h-[18px] px-0.5 text-center text-[10px] font-bold leading-[9px] flex items-center justify-center whitespace-normal wrap-break-word">
                          {prSignatories.cashAvailabilityName}
                        </div>
                        <div className="h-[18px] px-0.5 text-center text-[10px] font-bold leading-[9px] flex items-center justify-center whitespace-normal wrap-break-word">
                          {prSignatories.approvedByName}
                        </div>

                        <div className="border-r border-black h-[18px] px-0.5 text-center text-[10px] leading-[9px] flex items-center justify-center whitespace-normal wrap-break-word">
                          {prSignatories.requestedByDesignation || deptHeadDesignation}
                        </div>
                        <div className="border-r border-black h-[18px] px-0.5 text-center text-[10px] leading-[9px] flex items-center justify-center whitespace-normal wrap-break-word">
                          {prSignatories.cashAvailabilityDesignation}
                        </div>
                        <div className="h-[18px] px-0.5 text-center text-[10px] leading-[9px] flex items-center justify-center whitespace-normal wrap-break-word">
                          {prSignatories.approvedByDesignation}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : activeTab === "obr" && obrEnabled ? (
                  /* OBR Form - Outline only */
                  <div
                    className="border border-black relative min-h-[600px] p-4 max-w-2xl mx-auto"
                    style={{ fontFamily: 'Times New Roman, Times, serif' }}
                  >
                    <div className="grid grid-cols-[80px_1fr_80px] items-center">
                      <div className="flex justify-center">
                        <img src="/images/bataan OBR LOGO.jpg" alt="Bataan" className="h-14 w-14 object-contain" />
                      </div>
                      <div className="text-center font-sans flex flex-col items-center gap-1">
                        <div className="text-[16px] font-bold leading-tight">Republic of the Philippines</div>
                        <div className="text-[18px] font-bold leading-tight">PROVINCIAL GOVERNMENT OF BATAAN</div>
                        <div className="text-[15px] font-bold leading-tight">Balanga City, Bataan</div>
                      </div>
                      <div className="flex justify-center">
                        <img src="/images/1Bataan.jpg" alt="1Bataan" className="h-14 w-14 object-contain" />
                      </div>
                    </div>

                    <div className="mt-6 border border-black min-h-[500px] flex flex-col font-sans overflow-hidden">
                      <div className="flex-1 flex flex-col">
                        <div className="grid grid-cols-[1fr_200px] h-8 border-b-2 border-black">
                          <div className="flex items-center justify-center font-bold">OBLIGATION REQUEST</div>
                          <div className="flex items-center px-2 text-xs border-l-2 border-black">
                            NO. {formData.fund === "SEF" ? "200-26-" : "100-26-"}
                          </div>
                        </div>

                        <div className="grid grid-cols-[70px_1fr] h-7 border-b-2 border-black">
                          <div className="border-r-2 border-black px-2 flex items-center font-bold text-sm">Payee</div>
                          <div className="px-2 flex items-center text-sm">PR</div>
                        </div>
                        <div className="grid grid-cols-[70px_1fr] h-7 border-b-2 border-black">
                          <div className="border-r-2 border-black px-2 flex items-center font-bold text-sm">Office</div>
                          <div className="px-2 flex items-center text-sm">N/A</div>
                        </div>
                        <div className="grid grid-cols-[70px_1fr] h-7 border-b-2 border-black">
                          <div className="border-r-2 border-black px-2 flex items-center font-bold text-sm">Address</div>
                          <div className="px-2 flex items-center text-sm">N/A</div>
                        </div>

                        <div className="grid grid-cols-[70px_1fr_70px_95px_95px] h-9 border-b-2 border-black">
                          <div className="border-r-2 border-black px-1 flex items-center justify-center text-[10px] leading-tight text-center font-bold">
                            Responsibility
                            <br />
                            Center
                          </div>
                          <div className="border-r-2 border-black flex items-center justify-center font-bold text-xs">PARTICULARS</div>
                          <div className="border-r-2 border-black flex items-center justify-center font-bold text-xs">FPP</div>
                          <div className="border-r-2 border-black flex items-center justify-center font-bold text-xs">Account Code</div>
                          <div className="flex items-center justify-center font-bold text-xs">Amount</div>
                        </div>

                        <div className="grid grid-cols-[70px_1fr_70px_95px_95px] h-[260px] border-b-2 border-black">
                          <div className="border-r-2 border-black p-1 text-xs whitespace-pre-wrap break-words flex items-start justify-center text-center">{formData.responsibilityCenter || ""}</div>
                          <div className="border-r-2 border-black p-1 text-xs whitespace-pre-wrap break-words overflow-y-auto">{formData.purpose || ""}{formData.notes ? `\n\n${formData.notes}` : ""}</div>
                          <div className="border-r-2 border-black p-1 text-xs whitespace-pre-wrap break-words text-center">{formData.fpp || ""}</div>
                          <div className="border-r-2 border-black p-1 text-xs whitespace-pre-wrap break-words text-center">{formData.accountCode || ""}</div>
                          <div className="p-1 text-xs whitespace-pre-wrap break-words text-right">{formData.amount || ""}</div>
                        </div>

                        <div className="grid grid-cols-[70px_1fr_70px_95px_95px] h-7 border-b-2 border-black">
                          <div className="col-span-3" />
                          <div className="border-r-2 border-black flex items-center justify-end font-bold text-sm pr-2">TOTAL</div>
                          <div className="p-1 text-xs tabular-nums text-right">{formData.amount || ""}</div>
                        </div>

                        <div className="grid grid-cols-2 border-b-2 border-black h-[170px]">
                          <div className="border-r-2 border-black">
                            <div className="grid grid-cols-[34px_1fr] h-full">
                              <div className="flex items-start justify-center pt-3">
                                <div className="border border-black w-6 h-6 flex items-center justify-center text-xs">A.</div>
                              </div>
                              <div className="p-2">
                                <div className="font-bold text-sm">CERTIFIED</div>
                                <div className="mt-2 grid grid-cols-[34px_1fr] gap-y-3 text-[11px] leading-snug">
                                  <div className="flex items-start justify-center">
                                    <div className="border border-black w-5 h-5 flex items-center justify-center text-xs">✓</div>
                                  </div>
                                  <div>Charges to appropriation/allotment necessary,lawful and under my direct supervision.</div>
                                  <div className="flex items-start justify-center">
                                    <div className="border border-black w-5 h-5 flex items-center justify-center text-xs">✓</div>
                                  </div>
                                  <div>Supporting documents valid, proper and legal.</div>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div>
                            <div className="grid grid-cols-[34px_1fr] h-full">
                              <div className="flex items-start justify-center pt-3">
                                <div className="border border-black w-6 h-6 flex items-center justify-center text-xs">B.</div>
                              </div>
                              <div className="p-2">
                                <div className="font-bold text-sm">CERTIFIED</div>
                                <div className="mt-2 text-[11px] leading-snug ml-[18px]">Existence of available appropriation.</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="grid grid-cols-[110px_1fr_110px_1fr] h-10">
                            <div className="px-1.5 pt-4 border-r-2 border-black text-xs">Signature</div>
                            <div className="border-r-2 border-black" />
                            <div className="px-1.5 pt-4 border-r-2 border-black text-xs">Signature</div>
                            <div />
                          </div>
                          <div className="grid grid-cols-[110px_1fr_110px_1fr] h-10 border-t-2 border-black">
                            <div className="p-1.5 border-r-2 border-black text-xs">Printed Name</div>
                            <div className="h-full w-full border-r-2 border-black px-1 py-0 text-center font-bold text-[11px] leading-tight flex items-center justify-center">
                              {obrReps.leftName}
                            </div>
                            <div className="p-1.5 border-r-2 border-black text-xs">Printed Name</div>
                            <div className="h-full w-full px-1 py-0 text-center font-bold text-[11px] leading-tight flex items-center justify-center">
                              {obrReps.rightName}
                            </div>
                          </div>
                          <div className="grid grid-cols-[110px_1fr_110px_1fr] h-16 border-t-2 border-black">
                            <div className="p-1.5 border-r-2 border-black text-xs">Position</div>
                            <div className="p-1 text-center border-r-2 border-black pb-1 flex flex-col items-center justify-between">
                              <div className="text-[11px] leading-tight text-center border-b border-black w-full pb-0.5">
                                {obrReps.leftPosition}
                              </div>
                              <div className="text-[10px] text-black leading-[12px] text-center">
                                <div>Head Requesting Office/Authorized</div>
                                <div>Representative</div>
                              </div>
                            </div>
                            <div className="p-1.5 border-r-2 border-black text-xs">Position</div>
                            <div className="p-1 text-center pb-1 flex flex-col items-center justify-between">
                              <div className="text-[11px] leading-tight text-center border-b border-black w-full pb-0.5">
                                {obrReps.rightPosition}
                              </div>
                              <div className="text-[10px] text-black leading-[12px] text-center">
                                <div>Head, Budget Unit/Authorized</div>
                                <div>Representative</div>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-[110px_1fr_110px_1fr] h-6 border-t-2 border-black">
                            <div className="p-1.5 border-r-2 border-black text-xs">Date</div>
                            <div className="border-r-2 border-black" />
                            <div className="p-1.5 border-r-2 border-black text-xs">Date</div>
                            <div />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-1 grid grid-cols-[110px_1fr_110px_1fr] font-sans text-[10px] text-black">
                      <div />
                      <div />
                      <div />
                      <div className="pl-1">
                        Prepared by: {preparedByName ? <span className="underline">{preparedByName}</span> : "____________________"}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Right Panel - Signatories Editor */}
          <div className="w-64 shrink-0 overflow-y-auto border-l border-slate-200 bg-slate-50 p-3">

            {/* PR Signatories */}
            {activeTab === "pr" && prEnabled ? (
              <>
                <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">PR Signatories</div>

                {/* Requested by */}
                <div className="mb-3 rounded border border-slate-200 bg-white p-2.5">
                  <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-sky-600">Requested by</div>
                  <div className="space-y-1.5">
                    <div>
                      <label className="text-[10px] text-slate-500">Printed Name</label>
                      <input
                        type="text"
                        value={prSignatories.requestedByName || deptHeadName}
                        onChange={(e) => setPrSignatories((prev) => ({ ...prev, requestedByName: e.target.value }))}
                        className="mt-0.5 h-7 w-full rounded border border-slate-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none"
                        placeholder="Printed Name"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500">Position / Designation</label>
                      <input
                        type="text"
                        value={prSignatories.requestedByDesignation || deptHeadDesignation}
                        onChange={(e) => setPrSignatories((prev) => ({ ...prev, requestedByDesignation: e.target.value }))}
                        className="mt-0.5 h-7 w-full rounded border border-slate-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none"
                        placeholder="Designation"
                      />
                    </div>
                  </div>
                </div>

                {/* Cash Availability */}
                <div className="mb-3 rounded border border-slate-200 bg-white p-2.5">
                  <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-sky-600">Cash Availability</div>
                  <div className="space-y-1.5">
                    <div>
                      <label className="text-[10px] text-slate-500">Printed Name</label>
                      <input
                        type="text"
                        value={prSignatories.cashAvailabilityName}
                        onChange={(e) => setPrSignatories((prev) => ({ ...prev, cashAvailabilityName: e.target.value }))}
                        className="mt-0.5 h-7 w-full rounded border border-slate-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none"
                        placeholder="Printed Name"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500">Position / Designation</label>
                      <input
                        type="text"
                        value={prSignatories.cashAvailabilityDesignation}
                        onChange={(e) => setPrSignatories((prev) => ({ ...prev, cashAvailabilityDesignation: e.target.value }))}
                        className="mt-0.5 h-7 w-full rounded border border-slate-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none"
                        placeholder="Designation"
                      />
                    </div>
                  </div>
                </div>

                {/* Approved by */}
                <div className="mb-3 rounded border border-slate-200 bg-white p-2.5">
                  <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-sky-600">Approved by</div>
                  <div className="space-y-1.5">
                    <div>
                      <label className="text-[10px] text-slate-500">Printed Name</label>
                      <input
                        type="text"
                        value={prSignatories.approvedByName}
                        onChange={(e) => setPrSignatories((prev) => ({ ...prev, approvedByName: e.target.value }))}
                        className="mt-0.5 h-7 w-full rounded border border-slate-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none"
                        placeholder="Printed Name"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500">Position / Designation</label>
                      <input
                        type="text"
                        value={prSignatories.approvedByDesignation}
                        onChange={(e) => setPrSignatories((prev) => ({ ...prev, approvedByDesignation: e.target.value }))}
                        className="mt-0.5 h-7 w-full rounded border border-slate-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none"
                        placeholder="Designation"
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {/* OBR Signatories */}
            {activeTab === "obr" && obrEnabled ? (
              <>
                <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">OBR Signatories</div>

                {/* Head Requesting Office */}
                <div className="mb-3 rounded border border-slate-200 bg-white p-2.5">
                  <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-sky-600">Head Requesting Office</div>
                  <div className="space-y-1.5">
                    <div>
                      <label className="text-[10px] text-slate-500">Printed Name</label>
                      <input
                        type="text"
                        value={obrReps.leftName}
                        onChange={(e) => setObrReps((prev) => ({ ...prev, leftName: e.target.value }))}
                        className="mt-0.5 h-7 w-full rounded border border-slate-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none"
                        placeholder="Printed Name"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500">Position / Designation</label>
                      <input
                        type="text"
                        value={obrReps.leftPosition}
                        onChange={(e) => setObrReps((prev) => ({ ...prev, leftPosition: e.target.value }))}
                        className="mt-0.5 h-7 w-full rounded border border-slate-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none"
                        placeholder="Designation"
                      />
                    </div>
                  </div>
                </div>

                {/* Head Budget Unit */}
                <div className="mb-3 rounded border border-slate-200 bg-white p-2.5">
                  <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-sky-600">Head, Budget Unit</div>
                  <div className="space-y-1.5">
                    <div>
                      <label className="text-[10px] text-slate-500">Printed Name</label>
                      <input
                        type="text"
                        value={obrReps.rightName}
                        onChange={(e) => setObrReps((prev) => ({ ...prev, rightName: e.target.value }))}
                        className="mt-0.5 h-7 w-full rounded border border-slate-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none"
                        placeholder="Printed Name"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500">Position / Designation</label>
                      <input
                        type="text"
                        value={obrReps.rightPosition}
                        onChange={(e) => setObrReps((prev) => ({ ...prev, rightPosition: e.target.value }))}
                        className="mt-0.5 h-7 w-full rounded border border-slate-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none"
                        placeholder="Designation"
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : null}

          </div>

        </div>{/* end flex row */}

        {/* Footer */}
        <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {/* no draft in update mode */}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="inline-flex h-9 items-center justify-center rounded border border-slate-300 bg-white px-4 text-sm font-medium transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const missing = getMissingDetails()
                if (missing.length) {
                  setSubmitError(`Required: ${missing.join(", ")}`)
                  return
                }
                setSubmitError(null)

                const payload: NewRequestPayload = {
                  ...formData,
                  section: formData.section.trim() ? formData.section.trim() : "N/A",
                  driveLink: formData.driveLink.trim() ? formData.driveLink.trim() : "N/A",
                  requestedByName: prSignatories.requestedByName || deptHeadName,
                  requestedByDesignation: prSignatories.requestedByDesignation || deptHeadDesignation,
                  cashAvailabilityName: prSignatories.cashAvailabilityName || DEFAULT_CASH_AVAILABILITY_NAME,
                  cashAvailabilityDesignation:
                    prSignatories.cashAvailabilityDesignation || DEFAULT_CASH_AVAILABILITY_DESIGNATION,
                  approvedByName: prSignatories.approvedByName || DEFAULT_APPROVED_BY_NAME,
                  approvedByDesignation: prSignatories.approvedByDesignation || DEFAULT_APPROVED_BY_DESIGNATION,
                  certifiedAName: obrReps.leftName,
                  certifiedAPosition: obrReps.leftPosition,
                  certifiedBName: obrReps.rightName || DEFAULT_BUDGET_UNIT_NAME,
                  certifiedBPosition: obrReps.rightPosition || DEFAULT_BUDGET_UNIT_POSITION,
                  prItems: (() => {
                    const perPageItems = prPages.map((page, pageIndex) =>
                      page
                        .slice(pageIndex > 0 ? 1 : 0, page.length - 1)
                        .filter((r) => [r.unit, r.description, r.quantity, r.unitCost, r.totalCost].some((v) => String(v || "").trim()))
                    )

                    let globalIdx = 0
                    const flat: Array<{
                      itemNo: string
                      unit: string
                      description: string
                      quantity: string
                      unitCost: string
                      totalCost: string
                    }> = []

                    for (let p = 0; p < perPageItems.length; p++) {
                      const pageRows = perPageItems[p]
                      for (const r of pageRows) {
                        globalIdx++
                        flat.push({
                          itemNo: String(r.itemNo || "").trim() ? String(r.itemNo) : String(globalIdx),
                          unit: String(r.unit || ""),
                          description: String(r.description || ""),
                          quantity: String(r.quantity || ""),
                          unitCost: String(r.unitCost || ""),
                          totalCost: String(r.totalCost || ""),
                        })
                      }

                      if (p < perPageItems.length - 1) {
                        flat.push({
                          itemNo: "",
                          unit: "",
                          description: PR_PAGE_BREAK_MARKER,
                          quantity: "",
                          unitCost: "",
                          totalCost: "",
                        })
                      }
                    }

                    return flat
                  })(),
                  prEnabled,
                  obrEnabled,
                }

                setPendingSubmitPayload(payload)
                setConfirmUpdateOpen(true)
              }}
              className="inline-flex h-9 items-center justify-center rounded bg-sky-600 px-4 text-sm font-medium text-white transition hover:bg-sky-700"
            >
              Update
            </button>
          </div>
        </div>

        {confirmUpdateOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target) {
                setConfirmUpdateOpen(false)
                setPendingSubmitPayload(null)
              }
            }}
          >
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div className="text-base font-semibold text-slate-900">Confirm Update</div>
              </div>
              <div className="px-4 py-4 text-sm text-slate-700">Are you sure you want to update this request?</div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmUpdateOpen(false)
                    setPendingSubmitPayload(null)
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const payload = pendingSubmitPayload
                    setConfirmUpdateOpen(false)
                    setPendingSubmitPayload(null)
                    if (!payload) return
                    onSubmit?.(payload)
                  }}
                  className="inline-flex h-9 items-center justify-center rounded bg-sky-600 px-4 text-sm font-medium text-white transition hover:bg-sky-700"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}