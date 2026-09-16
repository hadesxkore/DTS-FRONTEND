import React from "react"

export type PoItem = {
  stockPropertyNo?: string
  unit?: string
  description?: string
  quantity?: string | number
  unitCost?: string | number
  amount?: string | number
}

export type PoTemplateModel = {
  supplier?: string
  address?: string
  tin?: string
  poNo?: string
  date?: string
  modeOfProcurement?: string
  prNo?: string
  placeOfDelivery?: string
  dateOfDelivery?: string
  deliveryTerm?: string
  paymentTerm?: string
  items?: PoItem[]
  totalAmountInWords?: string
  approvedByName?: string
  approvedByDesignation?: string
  conformeSupplierName?: string
  conformeDate?: string
  sanggunianResolutionNo?: string
  secretaryName?: string
  secretaryDate?: string
  trackingNo?: string
  status?: string
  logs?: Array<{ label?: string; byOffice?: string; [key: string]: any }>
  /** How many items fit per page (defaults to 10). GSO can set this. */
  itemsPerPage?: number
}

type PoTemplatePreviewProps = {
  model: PoTemplateModel
  className?: string
}

function convertNumberToWords(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return ""

  const units = [
    "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
    "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
    "SEVENTEEN", "EIGHTEEN", "NINETEEN",
  ]
  const tens = [
    "", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY",
  ]

  function toWords(n: number): string {
    if (n === 0) return ""
    if (n < 20) return units[n]
    if (n < 100) {
      const rem = n % 10
      return tens[Math.floor(n / 10)] + (rem > 0 ? `-${units[rem]}` : "")
    }
    if (n < 1000) {
      const rem = n % 100
      return `${units[Math.floor(n / 100)]} HUNDRED${rem > 0 ? ` ${toWords(rem)}` : ""}`
    }
    if (n < 1000000) {
      const thousands = Math.floor(n / 1000)
      const rem = n % 1000
      return `${toWords(thousands)} THOUSAND${rem > 0 ? ` ${toWords(rem)}` : ""}`
    }
    if (n < 1000000000) {
      const millions = Math.floor(n / 1000000)
      const rem = n % 1000000
      return `${toWords(millions)} MILLION${rem > 0 ? ` ${toWords(rem)}` : ""}`
    }
    return String(n)
  }

  const intPart = Math.floor(amount)
  const decPart = Math.round((amount - intPart) * 100)

  const words = toWords(intPart).trim()
  const centsStr = decPart > 0 ? `${decPart.toString().padStart(2, "0")}/100` : "XX / 100"

  return `${words} AND ${centsStr} PESOS`.trim()
}

export default function PoTemplatePreview({ model, className }: PoTemplatePreviewProps) {
  const safeNumber = (raw: any): number => {
    if (typeof raw === "number") return raw
    const s = String(raw || "").trim().replace(/,/g, "").replace(/[^0-9.-]/g, "")
    const n = Number.parseFloat(s)
    return Number.isFinite(n) ? n : 0
  }

  const formatMoneyNumber = (n: number) =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n)

  const items = Array.isArray(model.items) ? model.items : []

  const computedTotal = items.reduce((sum, item) => {
    const amt = safeNumber(item.amount)
    if (amt > 0) return sum + amt
    const qty = safeNumber(item.quantity)
    const cost = safeNumber(item.unitCost)
    return sum + (qty * cost || 0)
  }, 0)

  const totalInWords =
    model.totalAmountInWords?.trim() ||
    (computedTotal > 0 ? convertNumberToWords(computedTotal) : "")

  const supplier = model.supplier || ""
  const address = model.address || ""
  const tin = model.tin || ""
  const poNo = model.poNo || ""
  const date = model.date || ""
  const modeOfProcurement = model.modeOfProcurement || ""
  const prNo = model.prNo || ""
  const placeOfDelivery = model.placeOfDelivery || ""
  const dateOfDelivery = model.dateOfDelivery || ""
  const deliveryTerm = model.deliveryTerm || ""
  const paymentTerm = model.paymentTerm || ""
  const approvedByName = model.approvedByName || "JOSE ENRIQUE S. GARCIA III"
  const approvedByDesignation = model.approvedByDesignation || "PROVINCIAL GOVERNOR"

  // ─── Pagination ─────────────────────────────────────────────────────────────
  const ITEMS_PER_PAGE = Math.max(1, model.itemsPerPage ?? 10)
  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE))

  const pageChunks: PoItem[][] = []
  for (let p = 0; p < totalPages; p++) {
    pageChunks.push(items.slice(p * ITEMS_PER_PAGE, (p + 1) * ITEMS_PER_PAGE))
  }

  return (
    <div className={className}>
      {pageChunks.map((pageItems, pageIndex) => {
        const isFirstPage = pageIndex === 0
        const isLastPage = pageIndex === totalPages - 1
        const globalStartIdx = pageIndex * ITEMS_PER_PAGE

        return (
          <div
            key={pageIndex}
            className="print-page bg-white relative w-[816px] h-[1056px] overflow-hidden mx-auto p-3.5 print-no-mt text-black shadow-lg border border-[#cbd5e1] print:shadow-none print:border-none select-none box-border flex flex-col justify-between mb-6 print:mb-0"
            style={{ fontFamily: "'Times New Roman', Times, Georgia, serif" }}
          >
            {/* outer content */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* Top Appendix Header */}
              <div className="flex justify-between items-center text-[12px] italic text-[#1e293b] mb-1 shrink-0">
                <span>&nbsp;</span>
                <span className="font-semibold text-right">Appendix 49</span>
              </div>

              {/* Main Enclosed Table Container */}
              <div className="border border-black text-[11px] leading-tight flex-1 flex flex-col min-h-0 justify-between">
                {/* Top Section of Table */}
                <div className="shrink-0">
                  {/* Document Title Header — INSIDE enclosed table box */}
                  <div className="text-center py-2.5 border-b border-black">
                    <h1 className="text-[17px] font-bold uppercase tracking-wider leading-tight">
                      PURCHASE ORDER
                    </h1>
                    <h2 className="text-[13.5px] font-normal leading-tight mt-0.5">
                      Province of Bataan
                    </h2>
                  </div>

                  {/* Supplier & PO Metadata Box using standard HTML tables for 100% html2canvas border accuracy */}
                  <div className="grid grid-cols-[1fr_300px] border-b border-black">
                    <div className="border-r border-black p-2 text-[11px]">
                      <table className="w-full border-collapse">
                        <tbody>
                          <tr>
                            <td className="w-[60px] font-bold pb-1 pt-0.5 align-bottom whitespace-nowrap">
                              Supplier :
                            </td>
                            <td className="border-b border-black font-semibold uppercase px-1 pb-1 pt-0.5 align-bottom break-words">
                              {supplier || "\u00A0"}
                            </td>
                          </tr>
                          <tr>
                            <td className="w-[60px] font-bold pb-1 pt-1 align-bottom whitespace-nowrap">
                              Address :
                            </td>
                            <td className="border-b border-black uppercase px-1 pb-1 pt-1 align-bottom break-words">
                              {address || "\u00A0"}
                            </td>
                          </tr>
                          <tr>
                            <td className="w-[60px] font-bold pb-1 pt-1 align-bottom whitespace-nowrap">
                              TIN :
                            </td>
                            <td className="border-b border-black px-1 pb-1 pt-1 align-bottom">
                              {tin || "\u00A0"}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="p-2 text-[11px]">
                      <table className="w-full border-collapse">
                        <tbody>
                          <tr>
                            <td className="w-[125px] font-bold pb-1 pt-0.5 align-bottom whitespace-nowrap">
                              P.O. No. :
                            </td>
                            <td className="border-b border-black font-semibold px-1 pb-1 pt-0.5 align-bottom">
                              {poNo || "\u00A0"}
                            </td>
                          </tr>
                          <tr>
                            <td className="w-[125px] font-bold pb-1 pt-1 align-bottom whitespace-nowrap">
                              Date:
                            </td>
                            <td className="border-b border-black px-1 pb-1 pt-1 align-bottom">
                              {date || "\u00A0"}
                            </td>
                          </tr>
                          <tr>
                            <td className="w-[125px] font-bold pb-1 pt-1 align-bottom whitespace-nowrap">
                              Mode of Procurement :
                            </td>
                            <td className="border-b border-black px-1 pb-1 pt-1 align-bottom break-words">
                              {modeOfProcurement || "\u00A0"}
                            </td>
                          </tr>
                          <tr>
                            <td className="w-[125px] font-bold pb-1 pt-1 align-bottom whitespace-nowrap">
                              PR No./s :
                            </td>
                            <td className="border-b border-black px-1 pb-1 pt-1 align-bottom">
                              {prNo || "\u00A0"}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Gentlemen Salutation on all pages */}
                  <div className="p-2 text-[10.5px] border-b border-black bg-[#f8fafc]">
                    <div className="font-normal italic">Gentlemen:</div>
                    <div className="pl-6 pt-0.5">
                      Please furnish this office the following articles subject to the terms and conditions contained herein:
                    </div>
                  </div>

                  {/* Place of Delivery & Terms using standard HTML tables */}
                  <div className="grid grid-cols-[1fr_300px] border-b border-black">
                    <div className="border-r border-black p-2 text-[11px]">
                      <table className="w-full border-collapse">
                        <tbody>
                          <tr>
                            <td className="w-[105px] font-bold pb-1 pt-0.5 align-bottom whitespace-nowrap">
                              Place of Delivery:
                            </td>
                            <td className="border-b border-black font-semibold px-1 pb-1 pt-0.5 align-bottom">
                              {placeOfDelivery || "\u00A0"}
                            </td>
                          </tr>
                          <tr>
                            <td className="w-[105px] font-bold pb-1 pt-1 align-bottom whitespace-nowrap">
                              Date of Delivery:
                            </td>
                            <td className="border-b border-black px-1 pb-1 pt-1 align-bottom">
                              {dateOfDelivery || "\u00A0"}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="p-2 text-[11px]">
                      <table className="w-full border-collapse">
                        <tbody>
                          <tr>
                            <td className="w-[95px] font-bold pb-1 pt-0.5 align-bottom whitespace-nowrap">
                              Delivery Term :
                            </td>
                            <td className="border-b border-black px-1 pb-1 pt-0.5 align-bottom">
                              {deliveryTerm || "\u00A0"}
                            </td>
                          </tr>
                          <tr>
                            <td className="w-[95px] font-bold pb-1 pt-1 align-bottom whitespace-nowrap">
                              Payment Term :
                            </td>
                            <td className="border-b border-black px-1 pb-1 pt-1 align-bottom">
                              {paymentTerm || "\u00A0"}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Middle Section of Table: Unified HTML Items Table with exact column alignments */}
                <div className="flex-1 flex flex-col min-h-0">
                  <table className="w-full h-full border-collapse table-fixed text-[10.5px]">
                    <colgroup>
                      <col style={{ width: "80px" }} />
                      <col style={{ width: "55px" }} />
                      <col style={{ width: "auto" }} />
                      <col style={{ width: "70px" }} />
                      <col style={{ width: "110px" }} />
                      <col style={{ width: "120px" }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-black font-bold text-center bg-[#f1f5f9] text-[10.5px]">
                        <th className="border-r border-black py-1.5 px-1 font-bold text-center align-middle">
                          Stock / Property No.
                        </th>
                        <th className="border-r border-black py-1.5 px-1 font-bold text-center align-middle">
                          Unit
                        </th>
                        <th className="border-r border-black py-1.5 px-2 font-bold text-center align-middle">
                          Description
                        </th>
                        <th className="border-r border-black py-1.5 px-1 font-bold text-center align-middle">
                          Quantity
                        </th>
                        <th className="border-r border-black py-1.5 px-1 font-bold text-center align-middle">
                          Unit Cost
                        </th>
                        <th className="py-1.5 px-1 font-bold text-center align-middle">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: ITEMS_PER_PAGE }).map((_, slotIdx) => {
                        const item = pageItems[slotIdx]
                        const globalIdx = globalStartIdx + slotIdx
                        const isNothingFollowsRow = isLastPage && !item && slotIdx === pageItems.length

                        if (item) {
                          const qty = safeNumber(item.quantity)
                          const unitCost = safeNumber(item.unitCost)
                          const lineAmount = safeNumber(item.amount) || (qty * unitCost || 0)
                          const hasContent = Boolean(
                            (item.description && item.description.trim()) ||
                            unitCost > 0 ||
                            lineAmount > 0
                          )

                          if (!hasContent) {
                            return (
                              <tr key={globalIdx} className="border-b border-[#cbd5e1]">
                                <td className="border-r border-black px-1 py-1.5 text-center font-mono align-top text-[10.5px]">
                                  {item.stockPropertyNo || "\u00A0"}
                                </td>
                                <td className="border-r border-black px-1 py-1.5 text-center align-top text-[10.5px]">&nbsp;</td>
                                <td className="border-r border-black px-2 py-1.5 text-left align-top text-[10.5px]">&nbsp;</td>
                                <td className="border-r border-black px-1 py-1.5 text-center align-top text-[10.5px]">&nbsp;</td>
                                <td className="border-r border-black px-2 py-1.5 text-right align-top text-[10.5px]">&nbsp;</td>
                                <td className="px-2 py-1.5 text-right align-top text-[10.5px]">&nbsp;</td>
                              </tr>
                            )
                          }

                          return (
                            <tr key={globalIdx} className="border-b border-[#cbd5e1]">
                              <td className="border-r border-black px-1 py-1.5 text-center font-mono align-top text-[10.5px]">
                                {item.stockPropertyNo || "\u00A0"}
                              </td>
                              <td className="border-r border-black px-1 py-1.5 text-center lowercase font-medium align-top text-[10.5px]">
                                {item.unit || "\u00A0"}
                              </td>
                              <td className="border-r border-black px-2 py-1.5 text-left [overflow-wrap:anywhere] break-words whitespace-pre-wrap leading-relaxed align-top text-[10.5px]">
                                {item.description || "\u00A0"}
                              </td>
                              <td className="border-r border-black px-1 py-1.5 text-center tabular-nums font-medium align-top text-[10.5px]">
                                {qty > 0 ? qty : "\u00A0"}
                              </td>
                              <td className="border-r border-black px-2 py-1.5 text-right tabular-nums align-top text-[10.5px]">
                                {unitCost > 0 ? formatMoneyNumber(unitCost) : "\u00A0"}
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums font-semibold align-top text-[10.5px]">
                                {lineAmount > 0 ? formatMoneyNumber(lineAmount) : "\u00A0"}
                              </td>
                            </tr>
                          )
                        }

                        if (isNothingFollowsRow) {
                          return (
                            <tr key={globalIdx} className="border-b border-[#cbd5e1]">
                              <td className="border-r border-black px-1 py-1.5 text-center align-top">&nbsp;</td>
                              <td className="border-r border-black px-1 py-1.5 text-center align-top">&nbsp;</td>
                              <td className="border-r border-black px-2 py-1.5 text-center italic font-semibold text-[#334155] tracking-wide align-top text-[10px]">
                                &mdash;&mdash;&mdash;&mdash;&mdash;&mdash; Nothing Follows &mdash;&mdash;&mdash;&mdash;&mdash;&mdash;
                              </td>
                              <td className="border-r border-black px-1 py-1.5 text-center align-top">&nbsp;</td>
                              <td className="border-r border-black px-2 py-1.5 text-right align-top">&nbsp;</td>
                              <td className="px-2 py-1.5 text-right align-top">&nbsp;</td>
                            </tr>
                          )
                        }

                        return (
                          <tr key={globalIdx} className="border-b border-[#cbd5e1]">
                            <td className="border-r border-black px-1 py-1.5 text-center align-top">&nbsp;</td>
                            <td className="border-r border-black px-1 py-1.5 text-center align-top">&nbsp;</td>
                            <td className="border-r border-black px-2 py-1.5 text-left align-top">&nbsp;</td>
                            <td className="border-r border-black px-1 py-1.5 text-center align-top">&nbsp;</td>
                            <td className="border-r border-black px-2 py-1.5 text-right align-top">&nbsp;</td>
                            <td className="px-2 py-1.5 text-right align-top">&nbsp;</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      {/* SUB TOTAL on non-last pages / TOTAL on last page */}
                      {!isLastPage && (() => {
                        const pageSubTotal = pageItems.reduce((sum, item) => {
                          const amt = safeNumber(item.amount)
                          if (amt > 0) return sum + amt
                          const qty = safeNumber(item.quantity)
                          const cost = safeNumber(item.unitCost)
                          return sum + (qty * cost || 0)
                        }, 0)
                        return (
                          <tr className="border-t border-black font-bold text-[11px] bg-[#f8fafc]">
                            <td
                              colSpan={5}
                              className="border-r border-black py-1.5 px-3 text-right uppercase tracking-wider text-[10px]"
                            >
                              SUB TOTAL (Page {pageIndex + 1})
                            </td>
                            <td className="py-1.5 px-2 text-right tabular-nums font-bold">
                              {pageSubTotal > 0 ? formatMoneyNumber(pageSubTotal) : "0.00"}
                            </td>
                          </tr>
                        )
                      })()}

                      {isLastPage && (
                        <tr className="border-t border-black font-bold text-[11px] bg-[#f8fafc]">
                          <td
                            colSpan={5}
                            className="border-r border-black py-1.5 px-3 text-right uppercase tracking-wider text-[10.5px]"
                          >
                            TOTAL
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums font-bold">
                            {computedTotal > 0 ? formatMoneyNumber(computedTotal) : "0.00"}
                          </td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>

                {/* ═══ Bottom Section of Table: total/subtotal in words + signatories ═══ */}
                <div className="shrink-0">
                  {(() => {
                    const pageSubTotal = pageItems.reduce((sum, item) => {
                      const amt = safeNumber(item.amount)
                      if (amt > 0) return sum + amt
                      const qty = safeNumber(item.quantity)
                      const cost = safeNumber(item.unitCost)
                      return sum + (qty * cost || 0)
                    }, 0)

                    const displayWords = isLastPage
                      ? (totalInWords || "ZERO PESOS ONLY")
                      : (pageSubTotal > 0 ? convertNumberToWords(pageSubTotal) : "ZERO PESOS ONLY")
                    const amountLabel = isLastPage
                      ? "(Total Amount in Words )"
                      : `(Sub Total in Words — Page ${pageIndex + 1})`

                    return (
                      <>
                        {/* Amount in Words */}
                        <div className="border-t border-black p-2 text-[10.5px] leading-relaxed">
                          <span className="font-bold">{amountLabel} </span>
                          <span className="font-bold uppercase tracking-wide">
                            {displayWords}
                          </span>
                        </div>

                        {/* Signatories Block using standard HTML tables for clean underline borders */}
                        <div className="grid grid-cols-2 border-t border-black min-h-[130px]">
                          <div className="border-r border-black p-3 flex flex-col justify-between">
                            <div className="text-[11px] font-bold">Conforme:</div>
                            <div className="mt-4">
                              <table className="w-[85%] mx-auto border-collapse text-center">
                                <tbody>
                                  <tr>
                                    <td className="border-b border-black font-bold uppercase text-[11px] pb-1 h-[22px] align-bottom">
                                      {model.conformeSupplierName || "\u00A0"}
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="text-[9.5px] text-[#334155] pt-1">
                                      (Signature over Printed Name of Supplier)
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            <div className="mt-3">
                              <table className="w-[60%] mx-auto border-collapse text-center">
                                <tbody>
                                  <tr>
                                    <td className="border-b border-black text-[10.5px] pb-0.5 h-[18px] align-bottom">
                                      {model.conformeDate || "\u00A0"}
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="text-[9.5px] text-[#334155] pt-0.5">
                                      Date
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                          <div className="p-3 flex flex-col justify-between">
                            <div className="text-[11px] font-bold text-right italic">&nbsp;</div>
                            <div className="mt-4">
                              <table className="w-[85%] mx-auto border-collapse text-center">
                                <tbody>
                                  <tr>
                                    <td className="border-b border-black font-bold uppercase text-[12px] tracking-wide pb-1 h-[22px] align-bottom">
                                      {approvedByName}
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="text-[10.5px] font-bold uppercase tracking-wider pt-1.5">
                                      {approvedByDesignation}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            <div className="text-center text-[10px] text-transparent">&nbsp;</div>
                          </div>
                        </div>

                        {/* Sanggunian Resolution Section using standard HTML tables */}
                        <div className="border-t border-black p-2.5 text-[10px] leading-normal bg-[#f8fafc]">
                          <div className="italic text-center text-[9.5px] mb-2 font-serif">
                            (In Case of Negotiated Purchase pursuant to Section 369 (a) of RA 7160), this point must be accomplished.)
                          </div>
                          <table className="w-full border-collapse mb-2">
                            <tbody>
                              <tr>
                                <td className="w-[220px] font-semibold text-[10px] pb-1 align-bottom whitespace-nowrap">
                                  Approved per Sanggunian Resolution No.
                                </td>
                                <td className="border-b border-black text-[10.5px] font-mono px-1 pb-1 align-bottom">
                                  {model.sanggunianResolutionNo || "\u00A0"}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                          <table className="w-full border-collapse pt-1">
                            <tbody>
                              <tr>
                                <td className="w-[100px] font-bold pb-4 align-bottom whitespace-nowrap">
                                  Certified Correct :
                                </td>
                                <td className="text-center align-top px-2">
                                  <table className="w-full border-collapse">
                                    <tbody>
                                      <tr>
                                        <td className="border-b border-black font-bold uppercase text-[10.5px] pb-1 h-[18px] align-bottom text-center">
                                          {model.secretaryName || "\u00A0"}
                                        </td>
                                      </tr>
                                      <tr>
                                        <td className="text-[9px] text-[#475569] pt-1 text-center">
                                          Secretary to the Sanggunian
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </td>
                                <td className="w-[40px] font-semibold pb-4 align-bottom text-center px-1">
                                  Date
                                </td>
                                <td className="w-[140px] text-center align-top">
                                  <table className="w-full border-collapse">
                                    <tbody>
                                      <tr>
                                        <td className="border-b border-black text-[10.5px] pb-1 h-[18px] align-bottom text-center">
                                          {model.secretaryDate || "\u00A0"}
                                        </td>
                                      </tr>
                                      <tr>
                                        <td className="text-[9px] text-transparent pt-1">
                                          &nbsp;
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </>
                    )
                  })()}
                </div>
              </div>
            </div>

            {/* Page Number */}
            <div className="text-right text-[10px] text-[#475569] mt-1 shrink-0">
              Page {pageIndex + 1} of {totalPages}
            </div>
          </div>
        )
      })}
    </div>
  )
}

