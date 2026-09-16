import type { ObrTemplateModel } from "./ObrTemplatePreview"
import { Document, Page, StyleSheet, Text, View, Image } from "@react-pdf/renderer"

const styles = StyleSheet.create({
    page: {
        paddingTop: 12,
        paddingRight: 12,
        paddingBottom: 12,
        paddingLeft: 12,
        fontFamily: "Helvetica",
        fontSize: 9,
        backgroundColor: "#ffffff",
    },
    outerFrame: {
        borderWidth: 2.5,
        borderColor: "#000000",
        paddingTop: 4,
        paddingRight: 6,
        paddingBottom: 4,
        paddingLeft: 6,
        height: "100%",
        display: "flex",
        flexDirection: "column",
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingBottom: 4,
        paddingTop: 2,
    },
    logo: {
        width: 46,
        height: 46,
        objectFit: "contain",
    },
    headerTextContainer: {
        flex: 1,
        textAlign: "center",
        alignItems: "center",
    },
    repText: {
        fontSize: 9.5,
        marginBottom: 1,
    },
    govText: {
        fontSize: 12.5,
        fontFamily: "Helvetica-Bold",
        marginBottom: 1,
        letterSpacing: 0.3,
    },
    subText: {
        fontSize: 7.5,
    },
    mainBox: {
        borderWidth: 1,
        borderColor: "#000000",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        marginTop: 2,
    },
    titleRow: {
        flexDirection: "row",
        height: 24,
        borderBottomWidth: 1.5,
        borderBottomColor: "#000000",
        alignItems: "stretch",
    },
    titleCell: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    titleText: {
        fontSize: 12.5,
        fontFamily: "Helvetica-Bold",
        letterSpacing: 0.5,
    },
    obrNoCell: {
        width: 150,
        borderLeftWidth: 1.5,
        borderLeftColor: "#000000",
        justifyContent: "center",
        paddingLeft: 8,
    },
    obrNoText: {
        fontSize: 10.5,
        fontFamily: "Helvetica-Bold",
    },
    metaRow: {
        flexDirection: "row",
        height: 18,
        borderBottomWidth: 1,
        borderBottomColor: "#000000",
        alignItems: "stretch",
    },
    metaLabelCell: {
        width: 80,
        borderRightWidth: 1,
        borderRightColor: "#000000",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
    },
    metaLabel: {
        fontSize: 8.5,
        fontFamily: "Helvetica-Bold",
    },
    metaValueCell: {
        flex: 1,
        justifyContent: "center",
        paddingLeft: 8,
        height: "100%",
    },
    metaValue: {
        fontSize: 8.5,
    },
    tableHeaderRow: {
        flexDirection: "row",
        height: 24,
        borderBottomWidth: 1.5,
        borderBottomColor: "#000000",
        alignItems: "stretch",
    },
    thResp: {
        width: 85,
        borderRightWidth: 1,
        borderRightColor: "#000000",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
    },
    thPart: {
        flex: 1,
        borderRightWidth: 1,
        borderRightColor: "#000000",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
    },
    thFpp: {
        width: 55,
        borderRightWidth: 1,
        borderRightColor: "#000000",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
    },
    thAcc: {
        width: 85,
        borderRightWidth: 1,
        borderRightColor: "#000000",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
    },
    thAmt: {
        width: 80,
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
    },
    thText: {
        fontSize: 8,
        fontFamily: "Helvetica-Bold",
        textAlign: "center",
    },
    tableBodyRow: {
        flexDirection: "row",
        flex: 1,
        borderBottomWidth: 1.5,
        borderBottomColor: "#000000",
        alignItems: "stretch",
    },
    tdResp: {
        width: 85,
        borderRightWidth: 1,
        borderRightColor: "#000000",
        padding: 5,
        alignItems: "center",
        height: "100%",
    },
    tdPart: {
        flex: 1,
        borderRightWidth: 1,
        borderRightColor: "#000000",
        padding: 5,
        height: "100%",
    },
    tdFpp: {
        width: 55,
        borderRightWidth: 1,
        borderRightColor: "#000000",
        padding: 5,
        alignItems: "center",
        height: "100%",
    },
    tdAcc: {
        width: 85,
        borderRightWidth: 1,
        borderRightColor: "#000000",
        padding: 5,
        alignItems: "center",
        height: "100%",
    },
    tdAmt: {
        width: 80,
        padding: 5,
        alignItems: "center",
        height: "100%",
    },
    bodyText: {
        fontSize: 8.5,
    },
    totalRow: {
        flexDirection: "row",
        height: 18,
        borderBottomWidth: 1.5,
        borderBottomColor: "#000000",
        alignItems: "stretch",
    },
    totalLabelCell: {
        flex: 1,
        borderRightWidth: 1,
        borderRightColor: "#000000",
        justifyContent: "center",
        alignItems: "flex-end",
        paddingRight: 6,
        height: "100%",
    },
    totalValueCell: {
        width: 80,
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
    },
    totalText: {
        fontSize: 8.5,
        fontFamily: "Helvetica-Bold",
    },
    certRow: {
        flexDirection: "row",
        borderBottomWidth: 1.5,
        borderBottomColor: "#000000",
        minHeight: 70,
        alignItems: "stretch",
    },
    certBoxA: {
        flex: 1,
        borderRightWidth: 1.5,
        borderRightColor: "#000000",
        padding: 5,
        height: "100%",
    },
    certBoxB: {
        flex: 1,
        padding: 5,
        height: "100%",
    },
    certHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 3,
    },
    certBadge: {
        width: 13,
        height: 13,
        borderWidth: 1,
        borderColor: "#000000",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 4,
    },
    certBadgeText: {
        fontSize: 8,
        fontFamily: "Helvetica-Bold",
    },
    certTitle: {
        fontSize: 9,
        fontFamily: "Helvetica-Bold",
    },
    certBulletRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        marginTop: 3,
        paddingLeft: 8,
    },
    checkSquare: {
        width: 9,
        height: 9,
        borderWidth: 1,
        borderColor: "#000000",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 4,
        marginTop: 1,
    },
    checkText: {
        fontSize: 6.5,
        fontFamily: "Helvetica-Bold",
    },
    certDescText: {
        fontSize: 7.5,
        flex: 1,
    },
    sigGrid: {
        display: "flex",
        flexDirection: "column",
    },
    sigRow: {
        flexDirection: "row",
        height: 24,
        borderBottomWidth: 1,
        borderBottomColor: "#000000",
        alignItems: "stretch",
    },
    sigRowName: {
        flexDirection: "row",
        height: 20,
        borderBottomWidth: 1,
        borderBottomColor: "#000000",
        alignItems: "stretch",
    },
    sigRowPos: {
        flexDirection: "row",
        minHeight: 34,
        borderBottomWidth: 1,
        borderBottomColor: "#000000",
        alignItems: "stretch",
    },
    sigRowDate: {
        flexDirection: "row",
        height: 16,
        alignItems: "stretch",
    },
    sigLabelCell: {
        width: 75,
        borderRightWidth: 1,
        borderRightColor: "#000000",
        paddingLeft: 4,
        justifyContent: "center",
        height: "100%",
    },
    sigValueCellA: {
        flex: 1,
        borderRightWidth: 1.5,
        borderRightColor: "#000000",
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 4,
        height: "100%",
    },
    sigValueCellB: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 4,
        height: "100%",
    },
    sigLabelText: {
        fontSize: 8,
    },
    sigNameText: {
        fontSize: 9,
        fontFamily: "Helvetica-Bold",
        textAlign: "center",
    },
    sigPosTitle: {
        fontSize: 8.5,
        fontFamily: "Helvetica-Bold",
        textAlign: "center",
    },
    sigPosSub: {
        fontSize: 7,
        textAlign: "center",
        marginTop: 1,
    },
    footerRow: {
        flexDirection: "row",
        justifyContent: "flex-end",
        marginTop: 3,
    },
    footerText: {
        fontSize: 8,
    },
    footerName: {
        fontFamily: "Helvetica-Bold",
        textDecoration: "underline",
    },
})

const parseMoney = (raw: string) => {
    const cleaned = String(raw || '')
        .replace(/[^0-9.,-]/g, '')
        .replace(/,/g, '')
        .trim()
    if (!cleaned) return 0
    const n = Number.parseFloat(cleaned)
    return Number.isFinite(n) ? n : 0
}

const formatMoney = (n: number) =>
    new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const computeTotalFromAmount = (rawAmount: string) => {
    const text = String(rawAmount || '').trim()
    if (!text) return ''
    const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
    if (lines.length <= 1) return text
    const sum = lines.reduce((acc, line) => acc + parseMoney(line), 0)
    if (!Number.isFinite(sum)) return text
    return `₱ ${formatMoney(sum)}`
}

export default function ObrTemplatePdf({ model }: { model: ObrTemplateModel }) {
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    const bataanSealUrl = `${origin}/images/bataan-seal.png`
    const oneBataanLogoUrl = `${origin}/images/1bataan-logo.png`

    const totalAmountText = computeTotalFromAmount(model.amount || "")

    return (
        <Document>
            <Page size="LETTER" style={styles.page}>
                <View style={styles.outerFrame}>
                    {/* Header logos & titles */}
                    <View style={styles.headerRow}>
                        <Image src={bataanSealUrl} style={styles.logo} />
                        <View style={styles.headerTextContainer}>
                            <Text style={styles.repText}>Republic of the Philippines</Text>
                            <Text style={styles.govText}>PROVINCIAL GOVERNMENT OF BATAAN</Text>
                            <Text style={styles.subText}>
                                The Bunker @ The Capitol Compound, Tenejero, Balanga City, Bataan 2100
                            </Text>
                        </View>
                        <Image src={oneBataanLogoUrl} style={styles.logo} />
                    </View>

                    {/* Main OBR Box Container */}
                    <View style={styles.mainBox}>
                        {/* Title & OBR No */}
                        {(() => {
                            const obrPrefix = model.fund === "SEF" ? "200-26-" : "100-26-"
                            const obrRaw = String(model.obrNo || "").trim().replace(/^No\.?\s*/i, "")
                            let obrSuffix = obrRaw
                            if (obrSuffix.startsWith("100-26-")) {
                                obrSuffix = obrSuffix.slice("100-26-".length).trim()
                            } else if (obrSuffix.startsWith("200-26-")) {
                                obrSuffix = obrSuffix.slice("200-26-".length).trim()
                            }
                            return (
                                <View style={styles.titleRow}>
                                    <View style={styles.titleCell}>
                                        <Text style={styles.titleText}>OBLIGATION REQUEST</Text>
                                    </View>
                                    <View style={styles.obrNoCell}>
                                        <Text style={styles.obrNoText}>
                                            <Text style={{ color: "#000000" }}>No. {obrPrefix} </Text>
                                            {obrSuffix ? <Text style={{ color: "#2563eb", fontFamily: "Helvetica-Bold" }}>{obrSuffix}</Text> : null}
                                        </Text>
                                    </View>
                                </View>
                            )
                        })()}

                        {/* Payee, Office, Address */}
                        <View style={styles.metaRow}>
                            <View style={styles.metaLabelCell}>
                                <Text style={styles.metaLabel}>Payee</Text>
                            </View>
                            <View style={styles.metaValueCell}>
                                <Text style={styles.metaValue}>{model.payee || ""}</Text>
                            </View>
                        </View>

                        <View style={styles.metaRow}>
                            <View style={styles.metaLabelCell}>
                                <Text style={styles.metaLabel}>Office</Text>
                            </View>
                            <View style={styles.metaValueCell}>
                                <Text style={styles.metaValue}>{model.office || "N/A"}</Text>
                            </View>
                        </View>

                        <View style={[styles.metaRow, { borderBottomWidth: 1.5 }]}>
                            <View style={styles.metaLabelCell}>
                                <Text style={styles.metaLabel}>Address</Text>
                            </View>
                            <View style={styles.metaValueCell}>
                                <Text style={styles.metaValue}>{model.address || "N/A"}</Text>
                            </View>
                        </View>

                        {/* Table Header Row */}
                        <View style={styles.tableHeaderRow}>
                            <View style={styles.thResp}>
                                <Text style={styles.thText}>Responsibility{"\n"}Center</Text>
                            </View>
                            <View style={styles.thPart}>
                                <Text style={styles.thText}>PARTICULARS</Text>
                            </View>
                            <View style={styles.thFpp}>
                                <Text style={styles.thText}>FPP</Text>
                            </View>
                            <View style={styles.thAcc}>
                                <Text style={styles.thText}>Account Code</Text>
                            </View>
                            <View style={styles.thAmt}>
                                <Text style={styles.thText}>Amount</Text>
                            </View>
                        </View>

                        {/* Table Body */}
                        <View style={styles.tableBodyRow}>
                            <View style={styles.tdResp}>
                                <Text style={styles.bodyText}>{model.responsibilityCenter || ""}</Text>
                            </View>
                            <View style={styles.tdPart}>
                                <Text style={styles.bodyText}>
                                    {model.particulars || ""}{model.notes ? `\n\n${model.notes}` : ""}
                                </Text>
                            </View>
                            <View style={styles.tdFpp}>
                                <Text style={styles.bodyText}>{model.fpp || ""}</Text>
                            </View>
                            <View style={styles.tdAcc}>
                                <Text style={styles.bodyText}>{model.accountCode || ""}</Text>
                            </View>
                            <View style={styles.tdAmt}>
                                <Text style={styles.bodyText}>{model.amount || ""}</Text>
                            </View>
                        </View>

                        {/* Total Row */}
                        <View style={styles.totalRow}>
                            <View style={styles.totalLabelCell}>
                                <Text style={styles.totalText}>Total</Text>
                            </View>
                            <View style={styles.totalValueCell}>
                                <Text style={styles.totalText}>{totalAmountText}</Text>
                            </View>
                        </View>

                        {/* Certification Section (Box A & Box B) */}
                        <View style={styles.certRow}>
                            {/* Box A */}
                            <View style={styles.certBoxA}>
                                <View style={styles.certHeader}>
                                    <View style={styles.certBadge}>
                                        <Text style={styles.certBadgeText}>A.</Text>
                                    </View>
                                    <Text style={styles.certTitle}>Certified</Text>
                                </View>

                                <View style={styles.certBulletRow}>
                                    <View style={styles.checkSquare}>
                                        <Text style={styles.checkText}>v</Text>
                                    </View>
                                    <Text style={styles.certDescText}>
                                        Charges to appropriation/allotment necessary,lawful and under my direct supervision.
                                    </Text>
                                </View>

                                <View style={styles.certBulletRow}>
                                    <View style={styles.checkSquare}>
                                        <Text style={styles.checkText}>v</Text>
                                    </View>
                                    <Text style={styles.certDescText}>
                                        Supporting documents valid, proper and legal.
                                    </Text>
                                </View>
                            </View>

                            {/* Box B */}
                            <View style={styles.certBoxB}>
                                <View style={styles.certHeader}>
                                    <View style={styles.certBadge}>
                                        <Text style={styles.certBadgeText}>B.</Text>
                                    </View>
                                    <Text style={styles.certTitle}>Certified</Text>
                                </View>

                                <View style={styles.certBulletRow}>
                                    <Text style={styles.certDescText}>Existence of available appropriation.</Text>
                                </View>
                            </View>
                        </View>

                        {/* Signatures Section Grid */}
                        <View style={styles.sigGrid}>
                            {/* Signature label row */}
                            <View style={styles.sigRow}>
                                <View style={styles.sigLabelCell}>
                                    <Text style={styles.sigLabelText}>Signature:</Text>
                                </View>
                                <View style={styles.sigValueCellA} />
                                <View style={styles.sigLabelCell}>
                                    <Text style={styles.sigLabelText}>Signature:</Text>
                                </View>
                                <View style={styles.sigValueCellB} />
                            </View>

                            {/* Printed Name row */}
                            <View style={styles.sigRowName}>
                                <View style={styles.sigLabelCell}>
                                    <Text style={styles.sigLabelText}>Printed Name:</Text>
                                </View>
                                <View style={styles.sigValueCellA}>
                                    <Text style={styles.sigNameText}>{model.certifiedAName}</Text>
                                </View>
                                <View style={styles.sigLabelCell}>
                                    <Text style={styles.sigLabelText}>Printed Name:</Text>
                                </View>
                                <View style={styles.sigValueCellB}>
                                    <Text style={styles.sigNameText}>{model.certifiedBName}</Text>
                                </View>
                            </View>

                            {/* Position row */}
                            <View style={styles.sigRowPos}>
                                <View style={styles.sigLabelCell}>
                                    <Text style={styles.sigLabelText}>Position:</Text>
                                </View>
                                <View style={styles.sigValueCellA}>
                                    <Text style={styles.sigPosTitle}>{model.certifiedAPosition}</Text>
                                    <Text style={styles.sigPosSub}>Head Requesting Office/Authorized Representative</Text>
                                </View>
                                <View style={styles.sigLabelCell}>
                                    <Text style={styles.sigLabelText}>Position:</Text>
                                </View>
                                <View style={styles.sigValueCellB}>
                                    <Text style={styles.sigPosTitle}>{model.certifiedBPosition}</Text>
                                    <Text style={styles.sigPosSub}>Head, Budget Unit/Authorized Representative</Text>
                                </View>
                            </View>

                            {/* Date row */}
                            <View style={styles.sigRowDate}>
                                <View style={styles.sigLabelCell}>
                                    <Text style={styles.sigLabelText}>Date:</Text>
                                </View>
                                <View style={styles.sigValueCellA} />
                                <View style={styles.sigLabelCell}>
                                    <Text style={styles.sigLabelText}>Date:</Text>
                                </View>
                                <View style={styles.sigValueCellB} />
                            </View>
                        </View>
                    </View>

                    {/* Footer */}
                    <View style={styles.footerRow}>
                        <Text style={styles.footerText}>
                            Prepared by: {model.preparedByName ? <Text style={styles.footerName}>{model.preparedByName}</Text> : "____________________"}
                        </Text>
                    </View>
                </View>
            </Page>
        </Document>
    )
}
