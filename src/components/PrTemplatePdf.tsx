import type { PrTemplateModel } from "../admin/pages/SettingsPage"
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

const styles = StyleSheet.create({
  page: {
    paddingTop: 18,
    paddingRight: 18,
    paddingBottom: 18,
    paddingLeft: 18,
    fontFamily: "Helvetica",
    fontSize: 9,
  },
  frame: {
    borderWidth: 1,
    borderColor: "#000",
    padding: 12,
    height: "100%",
    display: "flex",
    flexDirection: "column",
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    textAlign: "center",
    marginBottom: 6,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  smallBold: {
    fontSize: 9,
    fontWeight: 700,
  },
  underline: {
    textDecoration: "underline",
  },
  metaBox: {
    borderWidth: 1,
    borderColor: "#000",
  },
  tableArea: {
    flexGrow: 0,
  },
  spacer: {
    flexGrow: 1,
  },
  metaRow: {
    flexDirection: "row",
  },
  metaCell: {
    padding: 3,
    fontSize: 9,
    fontWeight: 700,
  },
  metaCellBorderRight: {
    borderRightWidth: 1,
    borderRightColor: "#000",
  },
  metaCellBorderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: "#000",
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
  },
  th: {
    paddingVertical: 3,
    paddingHorizontal: 2,
    fontSize: 9,
    fontWeight: 700,
    textAlign: "center",
  },
  cellBorderRight: {
    borderRightWidth: 1,
    borderRightColor: "#000",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    minHeight: 18,
    alignItems: "center",
  },
  cellContainer: {
    justifyContent: "center",
    alignItems: "center",
    minHeight: 18,
    paddingVertical: 1,
    paddingHorizontal: 2,
  },
  cellContainerLeft: {
    justifyContent: "center",
    alignItems: "flex-start",
    minHeight: 18,
    paddingVertical: 1,
    paddingHorizontal: 2,
  },
  td: {
    fontSize: 8.5,
    textAlign: "center",
  },
  tdLeft: {
    fontSize: 8.5,
    textAlign: "left",
  },
  tdBold: {
    fontSize: 9.5,
    fontWeight: 700,
    textAlign: "center",
  },
  purposeRow: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: 700,
  },
  signaturesBox: {
    borderWidth: 1,
    borderColor: "#000",
    marginTop: 8,
  },
  signTopRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
  },
  signTopCell: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 9,
    textAlign: "center",
  },
  signRow: {
    flexDirection: "row",
    minHeight: 56,
  },
  signLeftLabels: {
    width: 70,
    borderRightWidth: 1,
    borderRightColor: "#000",
    padding: 4,
    fontSize: 8,
    fontWeight: 700,
    justifyContent: "space-between",
  },
  signCol: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    padding: 3,
  },
  signColLast: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 3,
  },
  signName: {
    fontSize: 8.5,
    fontWeight: 700,
    textAlign: "center",
    marginBottom: 2,
  },
  signDesignation: {
    fontSize: 8,
    textAlign: "center",
  },
  pageNumber: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 8,
    textAlign: "center",
    fontSize: 8,
    fontWeight: 700,
  },
})

const PR_PAGE_BREAK_MARKER = "__PR_PAGE_BREAK__"

const safeNumber = (raw: string) => {
  const s = String(raw || "").trim()
  if (!s) return 0
  const cleaned = s.replace(/[^0-9.,-]/g, "").replace(/,/g, "")
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

const formatMoney = (n: number) =>
  new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const formatPeso = (n: number) => `₱ ${formatMoney(n)}`

const computeItemTotal = (it: NonNullable<PrTemplateModel["items"]>[number]) => {
  const total = safeNumber(it.totalCost)
  if (total > 0) return total
  return safeNumber(it.quantity) * safeNumber(it.unitCost)
}

const splitPages = (items: NonNullable<PrTemplateModel["items"]>) => {
  const firstPageCapacity = 30
  const nextPageCapacity = 30

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
    return acc
  }

  if (items.length <= firstPageCapacity) return [items]
  const first = items.slice(0, firstPageCapacity)
  const rest = items.slice(firstPageCapacity)
  const nextPages = Array.from({ length: Math.ceil(rest.length / nextPageCapacity) }).map((_, idx) =>
    rest.slice(idx * nextPageCapacity, idx * nextPageCapacity + nextPageCapacity)
  )
  return [first, ...nextPages]
}

export default function PrTemplatePdf({ model }: { model: PrTemplateModel }) {
  const items = Array.isArray(model.items) ? model.items : []
  const pages = splitPages(items)
  const pageCount = pages.length

  const grandTotal = items.reduce((sum, it) => sum + computeItemTotal(it), 0)

  // Match the on-screen PR grid: 80/60/1fr/70/80/80 within a 816px-wide page.
  const widths = {
    itemNo: 80 / 816,
    unit: 60 / 816,
    desc: 446 / 816,
    qty: 70 / 816,
    unitCost: 80 / 816,
    totalCost: 80 / 816,
  } as const

  return (
    <Document>
      {pages.map((pageItems, pageIndex) => {
        const prevTotal = pages
          .slice(0, pageIndex)
          .reduce((sum, pg) => sum + pg.reduce((s2, it) => s2 + computeItemTotal(it), 0), 0)
        const pageSubTotal = pageItems.reduce((sum, it) => sum + computeItemTotal(it), 0)
        const isLastPage = pageIndex === pageCount - 1

        const itemRowCount = 27
        const totalRowIndex = itemRowCount

        return (
          <Page key={pageIndex} size="LETTER" style={styles.page}>
            <View style={styles.frame}>
              <Text style={styles.title}>PURCHASE REQUEST</Text>

              <View style={styles.headerRow}>
                <Text style={styles.smallBold}>
                  LGU: <Text style={[styles.smallBold, styles.underline]}>PROVINCIAL GOVERNMENT OF BATAAN</Text>
                </Text>
                <Text style={styles.smallBold}>FUND: {model.fund || ""}</Text>
              </View>

              <View style={styles.tableArea}>
                <View style={styles.metaBox}>
                  <View style={styles.metaRow}>
                    <View style={[{ width: "28%" }, styles.metaCellBorderRight]}>
                      <Text style={styles.metaCell}>Department: {model.department || ""}</Text>
                    </View>
                    <View style={{ width: "48%" }}>
                      <Text style={styles.metaCell}>
                        PR No.:{" "}
                        {model.prNo ? (
                          <Text style={{ color: "#2563eb", fontFamily: "Times-Bold" }}>
                            {model.prNo.replace(/^PR\s*No\.?\s*:?\s*/i, "")}
                          </Text>
                        ) : (
                          ""
                        )}
                      </Text>
                    </View>
                    <View style={{ width: "24%" }}>
                      <Text style={styles.metaCell}>Date: {model.date || ""}</Text>
                    </View>
                  </View>

                  <View style={[styles.metaRow, styles.metaCellBorderBottom]}>
                    <View style={[{ width: "28%" }, styles.metaCellBorderRight]}>
                      <Text style={styles.metaCell}>Section: {model.section || ""}</Text>
                    </View>
                    <View style={{ width: "48%" }}>
                      <Text style={styles.metaCell}>FPP: {model.fpp || ""}</Text>
                    </View>
                    <View style={{ width: "24%" }}>
                      <Text style={styles.metaCell}>{" "}</Text>
                    </View>
                  </View>

                  <View style={styles.tableHeaderRow}>
                    <View style={[{ width: `${widths.itemNo * 100}%` }, styles.cellBorderRight, styles.cellContainer]}>
                      <Text style={styles.th}>Item No.</Text>
                    </View>
                    <View style={[{ width: `${widths.unit * 100}%` }, styles.cellBorderRight, styles.cellContainer]}>
                      <Text style={styles.th}>Unit</Text>
                    </View>
                    <View style={[{ width: `${widths.desc * 100}%` }, styles.cellBorderRight, styles.cellContainer]}>
                      <Text style={styles.th}>Item Description</Text>
                    </View>
                    <View style={[{ width: `${widths.qty * 100}%` }, styles.cellBorderRight, styles.cellContainer]}>
                      <Text style={styles.th}>Quantity</Text>
                    </View>
                    <View style={[{ width: `${widths.unitCost * 100}%` }, styles.cellBorderRight, styles.cellContainer]}>
                      <Text style={styles.th}>Unit Cost</Text>
                    </View>
                    <View style={[{ width: `${widths.totalCost * 100}%` }, styles.cellContainer]}>
                      <Text style={styles.th}>Total Cost</Text>
                    </View>
                  </View>

                  {Array.from({ length: itemRowCount + 1 }).map((_, rowIndex) => {
                    const isTotalRow = rowIndex === totalRowIndex
                    const isCarryRow = pageIndex > 0 && rowIndex === 0

                    const pageItemIndex = pageIndex > 0 ? rowIndex - 1 : rowIndex
                    const row = !isTotalRow && !isCarryRow ? pageItems[pageItemIndex] : null

                    const itemNo = (() => {
                      if (isTotalRow) return ""
                      if (isCarryRow) return ""
                      const hasUnit = Boolean(String(row?.unit || "").trim())
                      if (!hasUnit) return ""

                      const countWithUnitUpToRow = pageItems
                        .slice(0, pageItemIndex + 1)
                        .filter((it) => String(it.unit || "").trim()).length

                      return String(countWithUnitUpToRow)
                    })()

                    const unit = isTotalRow || isCarryRow ? "" : String(row?.unit || "")
                    const desc = (() => {
                      if (isTotalRow) return "TOTAL"
                      if (isCarryRow) return "BALANCED FORWARDED"
                      return String(row?.description || "")
                    })()
                    const qty = isTotalRow || isCarryRow ? "" : String(row?.quantity || "")

                    const unitCost = (() => {
                      if (isTotalRow || isCarryRow) return ""
                      const raw = safeNumber(row?.unitCost || "")
                      return raw > 0 ? formatMoney(raw) : ""
                    })()

                    const totalCost = (() => {
                      if (isCarryRow) return formatPeso(prevTotal)
                      if (isTotalRow) return formatPeso(isLastPage ? grandTotal : prevTotal + pageSubTotal)
                      if (!row) return ""
                      const total = computeItemTotal(row)
                      return total > 0 ? formatPeso(total) : ""
                    })()

                    return (
                      <View key={rowIndex} style={styles.row}>
                        <View style={[{ width: `${widths.itemNo * 100}%` }, styles.cellBorderRight, styles.cellContainer]}>
                          <Text style={styles.td}>{itemNo}</Text>
                        </View>
                        <View style={[{ width: `${widths.unit * 100}%` }, styles.cellBorderRight, styles.cellContainer]}>
                          <Text style={styles.td}>{unit}</Text>
                        </View>
                        <View style={[{ width: `${widths.desc * 100}%` }, styles.cellBorderRight, isTotalRow || isCarryRow ? styles.cellContainer : styles.cellContainerLeft]}>
                          <Text style={isTotalRow || isCarryRow ? styles.tdBold : styles.tdLeft}>{desc}</Text>
                        </View>
                        <View style={[{ width: `${widths.qty * 100}%` }, styles.cellBorderRight, styles.cellContainer]}>
                          <Text style={styles.td}>{qty}</Text>
                        </View>
                        <View style={[{ width: `${widths.unitCost * 100}%` }, styles.cellBorderRight, styles.cellContainer]}>
                          <Text style={styles.td}>{unitCost}</Text>
                        </View>
                        <View style={[{ width: `${widths.totalCost * 100}%` }, styles.cellContainer]}>
                          <Text style={isTotalRow ? styles.tdBold : styles.td}>{totalCost}</Text>
                        </View>
                      </View>
                    )
                  })}
                </View>
              </View>

              <View style={styles.spacer} />

              <Text style={styles.purposeRow}>Purpose: {model.purpose || ""}</Text>

              <View style={styles.signaturesBox}>
                <View style={styles.signTopRow}>
                  <Text style={styles.signTopCell}>{" "}</Text>
                  <Text style={[styles.signTopCell, { borderLeftWidth: 1, borderLeftColor: "#000" }]}>Requested by:</Text>
                  <Text style={[styles.signTopCell, { borderLeftWidth: 1, borderLeftColor: "#000" }]}>Cash Availability:</Text>
                  <Text style={[styles.signTopCell, { borderLeftWidth: 1, borderLeftColor: "#000" }]}>Approved by:</Text>
                </View>

                <View style={styles.signRow}>
                  <View style={styles.signLeftLabels}>
                    <Text>Signature:</Text>
                    <Text>Printed Name:</Text>
                    <Text>Designation:</Text>
                  </View>

                  <View style={styles.signCol}>
                    <Text style={styles.signName}>{model.requestedByName || ""}</Text>
                    <Text style={styles.signDesignation}>{model.requestedByDesignation || ""}</Text>
                  </View>

                  <View style={styles.signCol}>
                    <Text style={styles.signName}>{String(model.cashAvailabilityName || "").trim() || "ALICIA R. MAGPANTAY"}</Text>
                    <Text style={styles.signDesignation}>{String(model.cashAvailabilityDesignation || "").trim() || "Provincial Treasurer"}</Text>
                  </View>

                  <View style={styles.signColLast}>
                    <Text style={styles.signName}>{String(model.approvedByName || "").trim() || "JOSE ENRIQUE S. GARCIA III"}</Text>
                    <Text style={styles.signDesignation}>{String(model.approvedByDesignation || "").trim() || "Provincial Governor"}</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.pageNumber}>{`${pageIndex + 1} of ${pageCount}`}</Text>
            </View>
          </Page>
        )
      })}
    </Document>
  )
}
