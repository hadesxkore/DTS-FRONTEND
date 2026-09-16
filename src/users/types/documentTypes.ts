// ─── Shared document types used across all tab components ─────────────────────

export type TabType = "pre-validation" | "ongoing" | "completed" | "discontinued"

export type DocumentParticular = {
  label: string
  color: string
}

export type DocumentLog = {
  label: string
  color: string
  byOffice?: string
  byUser?: string
  createdAt?: string
}

export type SubDocument = {
  trackingNo: string
  purpose: string
  amount: string
  supplier?: string
  status: string
  logs: DocumentLog[]
}

export type DocumentRow = {
  id: string
  trackingNo: string
  timestamp: string
  createdBy: string
  office?: string
  fund?: string
  section?: string
  fpp?: string
  department?: string
  contactNumber?: string
  responsibilityCenter?: string
  accountCode?: string
  email?: string
  requestedByName?: string
  requestedByDesignation?: string
  driveLink?: string
  prItems?: Array<{
    itemNo: string
    unit: string
    description: string
    quantity: string
    unitCost: string
    totalCost: string
  }>
  purpose: string
  notes?: string
  particulars: DocumentParticular[]
  amount: string
  supplierAmount?: string
  supplier?: string
  logs: DocumentLog[]
  action: string
  status: string
  prNo?: string
  obrNo?: string
  date?: string
  gsoRoutingSlip?: string
  returnToApprovalsRequested?: boolean
  returnToApprovalsReason?: string
  subDocuments?: SubDocument[]
}

export type PreviewType = "PR" | "OBR"

export const getSubDocAmount = (
  doc: { amount?: string; supplierAmount?: string; subDocuments?: Array<{ amount?: string }> },
  sidx: number
): string => {
  if (!doc.subDocuments || doc.subDocuments.length === 0) return ""

  const parseNum = (val: any) => {
    const cleaned = String(val || "").replace(/[^0-9.-]/g, "").replace(/,/g, "").trim()
    const n = Number.parseFloat(cleaned)
    return Number.isFinite(n) ? n : 0
  }

  const parentTotal = parseNum(doc.amount)
  if (parentTotal <= 0) return ""

  const mainSupplierAmt = parseNum(doc.supplierAmount)
  const availableForSubDocs = Math.max(0, parentTotal - mainSupplierAmt)

  let sumPrevious = 0
  for (let i = 0; i < sidx; i++) {
    const prevSub = doc.subDocuments[i]
    const rawAmt = prevSub ? parseNum(prevSub.amount) : 0
    if (i === 0) {
      if (rawAmt > 0 && rawAmt !== availableForSubDocs) {
        sumPrevious += rawAmt
      } else {
        sumPrevious += availableForSubDocs
      }
    } else {
      if (rawAmt > 0 && rawAmt !== availableForSubDocs) {
        sumPrevious += rawAmt
      } else {
        const remainingAtI = Math.max(0, availableForSubDocs - sumPrevious)
        sumPrevious += remainingAtI
      }
    }
  }

  const remaining = Math.max(0, availableForSubDocs - sumPrevious)

  const currentSub = doc.subDocuments[sidx]
  const currentRawAmt = currentSub ? parseNum(currentSub.amount) : 0

  if (sidx === 0) {
    if (currentRawAmt > 0 && currentRawAmt !== availableForSubDocs) {
      return currentSub?.amount || String(currentRawAmt)
    }
    return String(availableForSubDocs)
  }

  if (currentRawAmt > 0 && currentRawAmt !== availableForSubDocs && currentRawAmt <= remaining) {
    return currentSub?.amount || String(currentRawAmt)
  }

  return String(remaining)
}

export const getMainDocSupplierInfo = (
  doc: {
    amount?: string
    supplierAmount?: string
    supplier?: string
    subDocuments?: Array<{ amount?: string; supplier?: string }>
  }
): { supplier: string; amount: string } => {
  const parseNum = (val: any) => {
    const cleaned = String(val || "").replace(/[^0-9.-]/g, "").replace(/,/g, "").trim()
    const n = Number.parseFloat(cleaned)
    return Number.isFinite(n) ? n : 0
  }

  const hasSubDocs = Array.isArray(doc.subDocuments) && doc.subDocuments.length > 0
  const existingSupplier = String(doc.supplier || "").trim()
  const subSuppliers = Array.from(
    new Set((doc.subDocuments || []).map((s) => String(s.supplier || "").trim()).filter(Boolean))
  )
  const supplierName = existingSupplier || subSuppliers.join(", ")

  let mainAmt = String(doc.supplierAmount || "").trim()

  if (!mainAmt && hasSubDocs) {
    const parentTotal = parseNum(doc.amount)
    let sumSubDocs = 0
    doc.subDocuments?.forEach((s, sidx) => {
      const subAmtStr = s?.amount || getSubDocAmount(doc, sidx)
      sumSubDocs += parseNum(subAmtStr)
    })
    const mainRemaining = Math.max(0, parentTotal - sumSubDocs)
    if (mainRemaining > 0) {
      mainAmt = String(mainRemaining)
    }
  }

  return {
    supplier: supplierName,
    amount: mainAmt,
  }
}
