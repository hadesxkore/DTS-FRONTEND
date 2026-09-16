import { useState, useEffect } from "react"
import { Plus, Trash2, X, Save, AlertCircle } from "lucide-react"
import { type PoItem, type PoTemplateModel } from "./PoTemplatePreview"

type EditPoModalProps = {
  isOpen: boolean
  onClose: () => void
  onSave: (data: Partial<PoTemplateModel> & { poItems?: PoItem[]; supplierAddress?: string; poDate?: string }) => Promise<void>
  initialData: PoTemplateModel & { trackingNo?: string }
}

export default function EditPoModal({
  isOpen,
  onClose,
  onSave,
  initialData,
}: EditPoModalProps) {
  const [supplier, setSupplier] = useState("")
  const [address, setAddress] = useState("")
  const [tin, setTin] = useState("")
  const [poNo, setPoNo] = useState("")
  const [date, setDate] = useState("")
  const [modeOfProcurement, setModeOfProcurement] = useState("")
  const [prNo, setPrNo] = useState("")
  const [placeOfDelivery, setPlaceOfDelivery] = useState("")
  const [dateOfDelivery, setDateOfDelivery] = useState("")
  const [deliveryTerm, setDeliveryTerm] = useState("")
  const [paymentTerm, setPaymentTerm] = useState("")
  const [items, setItems] = useState<PoItem[]>([])
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [approvedByName, setApprovedByName] = useState("")
  const [approvedByDesignation, setApprovedByDesignation] = useState("")
  const [conformeSupplierName, setConformeSupplierName] = useState("")
  const [conformeDate, setConformeDate] = useState("")
  const [sanggunianResolutionNo, setSanggunianResolutionNo] = useState("")
  const [secretaryName, setSecretaryName] = useState("")
  const [secretaryDate, setSecretaryDate] = useState("")

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setSupplier(initialData.supplier || "")
    setAddress(initialData.address || "")
    setTin(initialData.tin || "")
    setPoNo(initialData.poNo || "")
    setDate(initialData.date || "")
    setModeOfProcurement(initialData.modeOfProcurement || "SVP")
    setPrNo(initialData.prNo || "")
    setPlaceOfDelivery(initialData.placeOfDelivery || "PG-BATAAN")
    setDateOfDelivery(initialData.dateOfDelivery || "")
    setDeliveryTerm(initialData.deliveryTerm || "")
    setPaymentTerm(initialData.paymentTerm || "")
    setItems(
      Array.isArray(initialData.items) && initialData.items.length > 0
        ? initialData.items.map((it) => ({ ...it }))
        : [
            {
              stockPropertyNo: "1",
              unit: "lot",
              description: "",
              quantity: "1",
              unitCost: "",
              amount: "",
            },
          ]
    )
    setItemsPerPage(initialData.itemsPerPage ?? 10)
    setApprovedByName(initialData.approvedByName || "JOSE ENRIQUE S. GARCIA III")
    setApprovedByDesignation(initialData.approvedByDesignation || "PROVINCIAL GOVERNOR")
    setConformeSupplierName(initialData.conformeSupplierName || initialData.supplier || "")
    setConformeDate(initialData.conformeDate || "")
    setSanggunianResolutionNo(initialData.sanggunianResolutionNo || "")
    setSecretaryName(initialData.secretaryName || "")
    setSecretaryDate(initialData.secretaryDate || "")
    setError(null)
  }, [isOpen, initialData])

  if (!isOpen) return null

  const handleItemChange = (index: number, field: keyof PoItem, value: any) => {
    setItems((prev) => {
      const copy = [...prev]
      const target = { ...copy[index], [field]: value }
      if (field === "quantity" || field === "unitCost") {
        const qty = parseFloat(String(field === "quantity" ? value : target.quantity || 0).replace(/,/g, "")) || 0
        const cost = parseFloat(String(field === "unitCost" ? value : target.unitCost || 0).replace(/,/g, "")) || 0
        if (qty > 0 && cost > 0) {
          target.amount = (qty * cost).toFixed(2)
        }
      }
      copy[index] = target
      return copy
    })
  }

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        stockPropertyNo: String(prev.length + 1),
        unit: "pc",
        description: "",
        quantity: "1",
        unitCost: "",
        amount: "",
      },
    ])
  }

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSaving(true)
      setError(null)
      await onSave({
        supplier,
        supplierAddress: address,
        address,
        tin,
        poNo,
        poDate: date,
        date,
        modeOfProcurement,
        prNo,
        placeOfDelivery,
        dateOfDelivery,
        deliveryTerm,
        paymentTerm,
        poItems: items,
        items,
        itemsPerPage,
        approvedByName,
        approvedByDesignation,
        conformeSupplierName,
        conformeDate,
        sanggunianResolutionNo,
        secretaryName,
        secretaryDate,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save PO changes")
    } finally {
      setSaving(false)
    }
  }

  const totalAmount = items.reduce((sum, it) => {
    const n = parseFloat(String(it.amount || 0).replace(/,/g, "")) || 0
    return sum + n
  }, 0)

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) onClose()
      }}
    >
      <div className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                GSO / PO Editor
              </span>
              <h3 className="text-base font-bold text-slate-900">Edit Purchase Order (PO)</h3>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Tracking No: <span className="font-semibold text-slate-700">{initialData.trackingNo || "-"}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-6 overflow-y-auto p-6 text-xs">
            {error ? (
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700 font-medium">
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            {/* Section 1: Supplier & PO Details */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-4">
              <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px] border-b border-slate-200 pb-2">
                1. Supplier &amp; PO Reference
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700" htmlFor="poSupplier">Supplier Name</label>
                  <input
                    id="poSupplier"
                    value={supplier}
                    onChange={(e) => {
                      setSupplier(e.target.value)
                      if (!conformeSupplierName || conformeSupplierName === supplier) {
                        setConformeSupplierName(e.target.value)
                      }
                    }}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="Enter supplier name"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700" htmlFor="poAddress">Address</label>
                  <input
                    id="poAddress"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="e.g. City of Balanga, Bataan"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700" htmlFor="poTin">TIN</label>
                  <input
                    id="poTin"
                    value={tin}
                    onChange={(e) => setTin(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="000-000-000-000"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700" htmlFor="poNo">PO No.</label>
                  <input
                    id="poNo"
                    value={poNo}
                    onChange={(e) => setPoNo(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 font-semibold focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="e.g. 2026-03-0145"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700" htmlFor="poDate">PO Date</label>
                  <input
                    id="poDate"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700" htmlFor="poMode">Mode of Procurement</label>
                  <input
                    id="poMode"
                    value={modeOfProcurement}
                    onChange={(e) => setModeOfProcurement(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="e.g. SVP / Public Bidding"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700" htmlFor="poPrNo">PR No.</label>
                  <input
                    id="poPrNo"
                    value={prNo}
                    onChange={(e) => setPrNo(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="PR Reference #"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Delivery & Payment Details */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-4">
              <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px] border-b border-slate-200 pb-2">
                2. Place of Delivery &amp; Terms
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700" htmlFor="poPlace">Place of Delivery</label>
                  <input
                    id="poPlace"
                    value={placeOfDelivery}
                    onChange={(e) => setPlaceOfDelivery(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="PG-BATAAN"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700" htmlFor="poDateDelivery">Date of Delivery</label>
                  <input
                    id="poDateDelivery"
                    value={dateOfDelivery}
                    onChange={(e) => setDateOfDelivery(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="e.g. 7 Calendar Days"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700" htmlFor="poDeliveryTerm">Delivery Term</label>
                  <input
                    id="poDeliveryTerm"
                    value={deliveryTerm}
                    onChange={(e) => setDeliveryTerm(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="e.g. FOB Destination"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700" htmlFor="poPaymentTerm">Payment Term</label>
                  <input
                    id="poPaymentTerm"
                    value={paymentTerm}
                    onChange={(e) => setPaymentTerm(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="e.g. Full Payment upon inspection"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Items Table */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  3. Line Items &amp; Quantities ({items.length})
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-600 font-medium">
                    <span>Items/page:</span>
                    <input
                      id="poItemsPerPage"
                      type="number"
                      min={1}
                      max={30}
                      value={itemsPerPage}
                      onChange={(e) => setItemsPerPage(Math.max(1, parseInt(e.target.value) || 10))}
                      className="h-7 w-14 rounded border border-slate-200 px-2 text-xs text-center focus:border-emerald-500 focus:outline-none"
                      title="How many items fit on one page before a new page is added"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={addItem}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 focus:outline-none"
                  >
                    <Plus className="size-3.5" />
                    Add Item
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold">
                    <tr>
                      <th className="w-16 px-2.5 py-2">Item #</th>
                      <th className="w-20 px-2.5 py-2">Unit</th>
                      <th className="px-2.5 py-2">Description</th>
                      <th className="w-20 px-2.5 py-2 text-right">Qty</th>
                      <th className="w-28 px-2.5 py-2 text-right">Unit Cost (₱)</th>
                      <th className="w-32 px-2.5 py-2 text-right">Amount (₱)</th>
                      <th className="w-10 px-2 py-2 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="px-2 py-1.5">
                          <input
                            value={it.stockPropertyNo ?? idx + 1}
                            onChange={(e) => handleItemChange(idx, "stockPropertyNo", e.target.value)}
                            className="h-8 w-full rounded border border-slate-200 px-2 text-xs text-center"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={it.unit ?? ""}
                            onChange={(e) => handleItemChange(idx, "unit", e.target.value)}
                            className="h-8 w-full rounded border border-slate-200 px-2 text-xs"
                            placeholder="pc/lot/box"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={it.description ?? ""}
                            onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                            className="h-8 w-full rounded border border-slate-200 px-2 text-xs"
                            placeholder="Item description"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="any"
                            value={it.quantity ?? ""}
                            onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
                            className="h-8 w-full rounded border border-slate-200 px-2 text-xs text-right"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="any"
                            value={it.unitCost ?? ""}
                            onChange={(e) => handleItemChange(idx, "unitCost", e.target.value)}
                            className="h-8 w-full rounded border border-slate-200 px-2 text-xs text-right"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="any"
                            value={it.amount ?? ""}
                            onChange={(e) => handleItemChange(idx, "amount", e.target.value)}
                            className="h-8 w-full rounded border border-slate-200 px-2 text-xs text-right font-semibold"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {items.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              className="text-slate-400 hover:text-rose-600 transition"
                              title="Delete row"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t border-slate-200 font-bold">
                    <tr>
                      <td colSpan={5} className="px-3 py-2 text-right text-slate-700">Total:</td>
                      <td className="px-3 py-2 text-right text-emerald-700 text-sm">
                        ₱ {totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Section 4: Signatories */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-4">
              <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px] border-b border-slate-200 pb-2">
                4. Signatories &amp; Resolution
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700" htmlFor="poApprovedName">Approved By (Name)</label>
                  <input
                    id="poApprovedName"
                    value={approvedByName}
                    onChange={(e) => setApprovedByName(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700" htmlFor="poApprovedDesig">Approved By (Designation)</label>
                  <input
                    id="poApprovedDesig"
                    value={approvedByDesignation}
                    onChange={(e) => setApprovedByDesignation(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700" htmlFor="poConforme">Conforme (Supplier / Authorized Rep)</label>
                  <input
                    id="poConforme"
                    value={conformeSupplierName}
                    onChange={(e) => setConformeSupplierName(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700" htmlFor="poConformeDate">Conforme Date</label>
                  <input
                    id="poConformeDate"
                    type="date"
                    value={conformeDate}
                    onChange={(e) => setConformeDate(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700" htmlFor="poResolution">Sanggunian Resolution No.</label>
                  <input
                    id="poResolution"
                    value={sanggunianResolutionNo}
                    onChange={(e) => setSanggunianResolutionNo(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700" htmlFor="poSecretary">Secretary to the Sangguniang Panlalawigan</label>
                  <input
                    id="poSecretary"
                    value={secretaryName}
                    onChange={(e) => setSecretaryName(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700" htmlFor="poSecretaryDate">Resolution Date</label>
                  <input
                    id="poSecretaryDate"
                    type="date"
                    value={secretaryDate}
                    onChange={(e) => setSecretaryDate(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50/80 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 focus:outline-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 focus:outline-none disabled:opacity-50"
            >
              <Save className="size-4" />
              {saving ? "Saving..." : "Save PO Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
