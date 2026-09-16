import Barcode from "react-barcode"

import type { PrTemplateModel } from "../admin/pages/SettingsPage"

export type { PrTemplateModel }

function HeaderBarcode({ trackingNo }: { trackingNo?: string }) {
  const barcodeValue = String(trackingNo || "").trim()
  if (!barcodeValue) return null

  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <Barcode
        value={barcodeValue}
        format="CODE128"
        width={1.35}
        height={32}
        displayValue={true}
        fontSize={10}
        margin={0}
      />
    </div>
  )
}

function shouldShowBarcode(model: PrTemplateModel): boolean {
  const logs = Array.isArray(model.logs) ? model.logs : []
  const statusLower = String(model.status || '').trim().toLowerCase()

  // Always show once the document has reached Budget or PTO (admin approval path)
  if (statusLower === 'in-budget' || statusLower === 'in-pto') return true

  // Also show if any log indicates a transfer to Budget or PTO (covers legacy labels too)
  const hasTransferToBudgetOrPto = logs.some((l) => {
    const label = String(l?.label || '').trim().toLowerCase()
    return (
      label.includes('transferred to budget') ||
      label.includes('transferred to pto') ||
      // legacy: "Approved: Transferred to Budget (...)"
      /approved[:\s]+transferred\s+to\s+(budget|pto)/i.test(label)
    )
  })
  if (hasTransferToBudgetOrPto) return true

  // Helper to check if an office has approved
  const hasApproved = (officeNeedle: string) => {
    const needle = officeNeedle.toLowerCase()
    return logs.some((l) => {
      const label = String(l?.label || '').trim().toLowerCase()
      const byOffice = String(l?.byOffice || '').trim().toLowerCase()
      if (!label.startsWith('approved')) return false
      return byOffice.includes(needle) || label.includes(needle)
    })
  }

  // OBR only: need BAC approval
  if (model.hasObr && !model.hasPr) {
    return hasApproved('bac')
  }

  // PR only or PR+OBR: need both GSO and BAC approval
  if (model.hasPr) {
    return hasApproved('gso') && hasApproved('bac')
  }

  // Default: show if document is approved/completed
  return statusLower === 'approved' || statusLower === 'completed'
}

export function PrTemplatePreview({
  model,
  activePage = 0,
  forceShowAllPages = false,
}: {
  model: PrTemplateModel
  activePage?: number
  forceShowAllPages?: boolean
}) {
  const items = Array.isArray(model.items) ? model.items : []
  const PR_PAGE_BREAK_MARKER = "__PR_PAGE_BREAK__"

  const safeNumber = (raw: any) => {
    const s = String(raw || "").trim()
    if (!s) return 0
    const cleaned = s.replace(/[^0-9.,-]/g, "").replace(/,/g, "")
    const n = Number.parseFloat(cleaned)
    return Number.isFinite(n) ? n : 0
  }

  const formatMoney = (n: number) =>
    new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

  const formatPeso = (n: number) => `₱ ${formatMoney(n)}`

  const computedGrandTotal = items.reduce((sum, it) => {
    const total = safeNumber(it.totalCost)
    if (total > 0) return sum + total
    return sum + safeNumber(it.quantity) * safeNumber(it.unitCost)
  }, 0)

  const firstPageCapacity = 25
  const nextPageCapacity = 25

  const pages: typeof items[] = (() => {
    const hasMarkers = items.some((it) => String(it?.description || "").trim() === PR_PAGE_BREAK_MARKER)
    if (hasMarkers) {
      const acc: typeof items[] = [[]]
      for (const it of items) {
        const isMarker = String(it?.description || "").trim() === PR_PAGE_BREAK_MARKER
        if (isMarker) {
          acc.push([])
        } else {
          acc[acc.length - 1].push(it)
        }
      }
      return acc.length ? acc : [items.filter((it) => String(it?.description || "").trim() !== PR_PAGE_BREAK_MARKER)]
    }

    if (items.length <= firstPageCapacity) return [items]
    const first = items.slice(0, firstPageCapacity)
    const rest = items.slice(firstPageCapacity)
    const nextPages = Array.from({ length: Math.ceil(rest.length / nextPageCapacity) }).map((_, idx) =>
      rest.slice(idx * nextPageCapacity, idx * nextPageCapacity + nextPageCapacity)
    )
    return [first, ...nextPages]
  })()

  const pageCount = pages.length

  const computeItemTotal = (it: (typeof items)[number]) => {
    const total = safeNumber(it.totalCost)
    if (total > 0) return total
    return safeNumber(it.quantity) * safeNumber(it.unitCost)
  }

  return (
    <div className="w-full box-border print-no-space">
      <div className="w-full flex flex-col items-center print-no-space pr-pages-wrapper">
        {pages.map((pageItems, pageIndex) => {
          const prevTotal = pages
            .slice(0, pageIndex)
            .reduce((sum, pg) => sum + pg.reduce((s2, it) => s2 + computeItemTotal(it), 0), 0)
          const pageSubTotal = pageItems.reduce((sum, it) => sum + computeItemTotal(it), 0)
          const isLastPage = pageIndex === pageCount - 1

          const itemRowCount = 25
          const totalRowIndex = itemRowCount

          const isVisible = forceShowAllPages || pageIndex === activePage

          return (
            <div
              key={pageIndex}
              className={`print-page bg-white relative w-[816px] h-[1056px] overflow-hidden mx-auto p-3 print-no-mt ${isVisible ? "" : "hidden"}`}
              style={{
                fontFamily: "'Times New Roman', Times, Georgia, serif",
                breakAfter: pageIndex === pageCount - 1 ? "auto" : "page",
                pageBreakAfter: pageIndex === pageCount - 1 ? "auto" : "always",
              }}
            >
              <div className="absolute top-1 right-2 text-[12px] italic">Appendix 47</div>

              {pageIndex === 0 ? (
                <div className="absolute top-7 right-4 z-20 bg-white origin-top-right scale-90">
                  {shouldShowBarcode(model) ? (
                    <HeaderBarcode trackingNo={model.trackingNo} />
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 h-[calc(100%-12px)] w-full border border-black bg-white px-4 pb-6 pt-5 relative box-border flex flex-col justify-between">
                <div>
                  <h3 className="text-center text-xl font-bold uppercase tracking-wide">PURCHASE REQUEST</h3>
                  <div className="mt-1 flex items-center justify-between text-[12px] font-bold">
                    <span>
                      LGU: <span className="underline">PROVINCIAL GOVERNMENT OF BATAAN</span>
                    </span>
                    <span
                      className="text-right"
                      style={{ paddingRight: "80px" }}
                    >
                      FUND: {model.fund || ""}
                    </span>
                  </div>

                  {/* Main Purchase Request Box */}
                  <div className="mt-2 border border-black p-0 pr-table">
                    {/* Header info table */}
                    <table className="w-full border-collapse table-fixed text-[12px] font-bold border-b border-black">
                      <colgroup>
                        <col style={{ width: "140px" }} />
                        <col style={{ width: "auto" }} />
                        <col style={{ width: "130px" }} />
                      </colgroup>
                      <tbody>
                        <tr>
                          <td className="border-r border-black px-2 pt-1.5 pb-2 align-middle whitespace-nowrap">
                            Department: {model.department || ""}
                          </td>
                          <td className="px-2 pt-1.5 pb-2 align-middle">
                            <span>PR No.:</span>
                            {model.prNo ? (
                              <span className="text-blue-600 font-bold ml-1.5 font-mono">
                                {model.prNo.replace(/^PR\s*No\.?\s*:?\s*/i, "")}
                              </span>
                            ) : null}
                          </td>
                          <td
                            className="px-2 pt-1.5 pb-2 text-right align-middle whitespace-nowrap"
                            style={{ paddingRight: "180px" }}
                          >
                            Date: {model.date || ""}
                          </td>
                        </tr>
                        <tr>
                          <td className="border-r border-black px-2 pt-1.5 pb-2 align-middle whitespace-nowrap">
                            Section: {model.section || ""}
                          </td>
                          <td className="px-2 pt-1.5 pb-2 align-middle" colSpan={2}>
                            FPP: {model.fpp || ""}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Unified Items Table with aligned 140px column boundary (80px + 60px) */}
                    <table className="w-full border-collapse table-fixed text-[11px]">
                      <colgroup>
                        <col style={{ width: "80px" }} />
                        <col style={{ width: "60px" }} />
                        <col style={{ width: "auto" }} />
                        <col style={{ width: "70px" }} />
                        <col style={{ width: "80px" }} />
                        <col style={{ width: "85px" }} />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-black text-[11.5px] font-bold text-center bg-[#f1f5f9]">
                          <th className="border-r border-black pt-1.5 pb-2 px-1 font-bold text-center align-middle">Item No.</th>
                          <th className="border-r border-black pt-1.5 pb-2 px-1 font-bold text-center align-middle">Unit</th>
                          <th className="border-r border-black pt-1.5 pb-2 px-2 font-bold text-center align-middle">Item Description</th>
                          <th className="border-r border-black pt-1.5 pb-2 px-1 font-bold text-center align-middle">Quantity</th>
                          <th className="border-r border-black pt-1.5 pb-2 px-1 font-bold text-center align-middle">Unit Cost</th>
                          <th className="pt-1.5 pb-2 px-1 font-bold text-center align-middle">Total Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: itemRowCount + 1 }).map((_, rowIndex) => {
                          const isTotalRow = rowIndex === totalRowIndex
                          const isCarryRow = pageIndex > 0 && rowIndex === 0

                          const pageItemIndex = pageIndex > 0 ? rowIndex - 1 : rowIndex
                          const row = !isTotalRow && !isCarryRow ? pageItems[pageItemIndex] : null
                          const rowHasUnit = row ? Boolean(String(row.unit || "").trim()) : false
                          const rowTotal = row ? computeItemTotal(row) : 0

                          const autoItemNo = rowHasUnit
                            ? String(
                              pageItems
                                .slice(0, pageItemIndex + 1)
                                .filter((it) => String(it.unit || "").trim()).length,
                            )
                            : ""

                          const displayItemNo = isTotalRow || isCarryRow || !rowHasUnit ? "" : autoItemNo

                          let displayTotalCost = ""
                          if (isTotalRow) {
                            displayTotalCost = formatPeso(isLastPage ? computedGrandTotal : prevTotal + pageSubTotal)
                          } else if (isCarryRow) {
                            displayTotalCost = prevTotal ? formatPeso(prevTotal) : ""
                          } else if (row) {
                            if (row.totalCost) {
                              const num = safeNumber(row.totalCost)
                              displayTotalCost = num > 0 ? `₱ ${formatMoney(num)}` : String(row.totalCost)
                            } else if (rowTotal > 0) {
                              displayTotalCost = formatPeso(rowTotal)
                            }
                          }

                          let displayUnitCost = ""
                          if (!isTotalRow && !isCarryRow && row?.unitCost) {
                            const costNum = safeNumber(row.unitCost)
                            displayUnitCost = costNum > 0 ? formatMoney(costNum) : String(row.unitCost)
                          }

                          if (isTotalRow) {
                            return (
                              <tr key={rowIndex} className="border-b border-black last:border-b-0 bg-[#f8fafc] font-bold">
                                <td className="border-r border-black px-1 py-1 text-center font-mono align-middle text-[10.5px]">&nbsp;</td>
                                <td className="border-r border-black px-1 py-1 text-center align-middle text-[10.5px]">&nbsp;</td>
                                <td className="border-r border-black px-2 py-1 text-center font-bold text-[12px] align-middle tracking-wider uppercase">
                                  {isLastPage ? "TOTAL" : "SUB-TOTAL"}
                                </td>
                                <td className="border-r border-black px-1 py-1 text-center align-middle text-[10.5px]">&nbsp;</td>
                                <td className="border-r border-black px-1.5 py-1 text-right align-middle text-[10.5px]">&nbsp;</td>
                                <td className="px-1.5 py-1 text-right tabular-nums align-middle text-[11px] font-bold">
                                  {displayTotalCost}
                                </td>
                              </tr>
                            )
                          }

                          return (
                            <tr
                              key={rowIndex}
                              className="border-b border-black last:border-b-0 min-h-[22px]"
                            >
                              <td className="border-r border-black px-1 pt-0.5 pb-1 text-center font-mono align-top text-[10.5px]">
                                {displayItemNo || "\u00A0"}
                              </td>
                              <td className="border-r border-black px-1 pt-0.5 pb-1 text-center align-top text-[10.5px]">
                                {isCarryRow ? "" : (row?.unit || "\u00A0")}
                              </td>
                              <td
                                className={`border-r border-black px-2 pt-0.5 pb-1 ${isCarryRow ? "text-center font-bold text-[11px]" : "text-left text-[10.5px] font-normal"} align-top break-words [overflow-wrap:anywhere] break-all leading-normal`}
                              >
                                {isCarryRow ? "BALANCED FORWARDED" : (row?.description || "\u00A0")}
                              </td>
                              <td className="border-r border-black px-1 pt-0.5 pb-1 text-center tabular-nums align-top text-[10.5px]">
                                {isCarryRow ? "" : (row?.quantity || "\u00A0")}
                              </td>
                              <td className="border-r border-black px-1.5 pt-0.5 pb-1 text-right tabular-nums align-top text-[10.5px]">
                                {displayUnitCost || "\u00A0"}
                              </td>
                              <td className="px-1.5 pt-0.5 pb-1 text-right tabular-nums align-top text-[10.5px]">
                                {displayTotalCost || "\u00A0"}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-1 text-[12.5px] px-2 leading-tight">
                    <span className="font-bold">Purpose:</span> {model.purpose || ""}
                  </div>
                </div>

                {/* Signatories Block */}
                <div>
                  <div className="border border-black p-0 mb-1">
                    <table className="w-full border-collapse table-fixed text-[11.5px]" style={{ tableLayout: "fixed" }}>
                      <colgroup>
                        <col style={{ width: "95px" }} />
                        <col style={{ width: "30%" }} />
                        <col style={{ width: "35%" }} />
                        <col style={{ width: "35%" }} />
                      </colgroup>
                      <tbody>
                        {/* Row 1: Signature space — left empty, headers at top of right cells */}
                        <tr style={{ height: "85px" }}>
                          <td
                            className="border-r border-black px-1 text-[10.5px] text-left"
                            style={{ verticalAlign: "top" }}
                          >
                            &nbsp;
                          </td>
                          <td
                            className="border-r border-b border-black px-1 text-center font-bold"
                            style={{ verticalAlign: "top", paddingTop: "4px" }}
                          >
                            Requested by:
                          </td>
                          <td
                            className="border-r border-b border-black px-1 text-center font-bold"
                            style={{ verticalAlign: "top", paddingTop: "4px" }}
                          >
                            Cash Availability:
                          </td>
                          <td
                            className="border-b border-black px-1 text-center font-bold"
                            style={{ verticalAlign: "top", paddingTop: "4px" }}
                          >
                            Approved by:
                          </td>
                        </tr>
                        {/* Row 2: Labels on left + Names + Designations on right */}
                        <tr>
                          <td
                            className="border-r border-black px-1 text-[10.5px] text-left"
                            style={{ verticalAlign: "top", paddingTop: "3px" }}
                          >
                            <div>Signature:</div>
                            <div>Printed Name:</div>
                            <div>Designation:</div>
                          </td>
                          <td
                            className="border-r border-black px-1 text-center"
                            style={{ verticalAlign: "top", paddingTop: "3px" }}
                          >
                            <div className="font-bold text-[11px]">{model.requestedByName || "\u00A0"}</div>
                            <div className="text-[10px]">{model.requestedByDesignation || "\u00A0"}</div>
                          </td>
                          <td
                            className="border-r border-black px-1 text-center"
                            style={{ verticalAlign: "top", paddingTop: "3px" }}
                          >
                            <div className="font-bold text-[11px]">{String(model.cashAvailabilityName || "").trim() || "ALICIA R. MAGPANTAY"}</div>
                            <div className="text-[10px]">{String(model.cashAvailabilityDesignation || "").trim() || "Provincial Treasurer"}</div>
                          </td>
                          <td
                            className="px-1 text-center"
                            style={{ verticalAlign: "top", paddingTop: "3px" }}
                          >
                            <div className="font-bold text-[11px]">{String(model.approvedByName || "").trim() || "JOSE ENRIQUE S. GARCIA III"}</div>
                            <div className="text-[10px]">{String(model.approvedByDesignation || "").trim() || "Provincial Governor"}</div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="text-center text-[11.5px] leading-none font-bold pt-1">
                    {`${pageIndex + 1} of ${pageCount}`}
                  </div>
                </div>

              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default PrTemplatePreview

