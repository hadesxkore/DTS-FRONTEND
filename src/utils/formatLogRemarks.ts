/**
 * Formats log remarks by stripping redundant office prefixes (e.g. "GSO:", "PGO:")
 * and action/remarks prefixes (e.g. "RETURNED:", "APPROVED:", "Remarks:", "Remarks -", etc.),
 * so only the actual message or remark is shown.
 *
 * Examples:
 * - "GSO: RETURNED: Check the unit price" -> "Check the unit price"
 * - "Remarks: DONE" -> "DONE"
 * - "GSO: APPROVED: Approved" -> "Approved"
 * - "Returned: Check the unit price" -> "Check the unit price"
 * - "Submitted" -> "Submitted"
 * - "Transferred to BUDGET (For DV checking)" -> "For DV checking"
 */
export function formatLogRemarks(labelRaw: string | undefined | null): string {
  const original = String(labelRaw || '').trim()
  if (!original) return '-'

  let text = original

  // Handle "Transferred to OFFICE (remarks)" or "Received by OFFICE (remarks)"
  const parenMatch = text.match(/^(?:transferred\s+to\s+[^()]+|received\s+by\s+[^()]+)\s*\(([^)]+)\)$/i)
  if (parenMatch && parenMatch[1]) {
    return parenMatch[1].trim() || original
  }

  // Handle "Transferred to OFFICE: remarks"
  const transferColonMatch = text.match(/^transferred\s+to\s+[^:]+:\s*(.+)$/i)
  if (transferColonMatch && transferColonMatch[1]) {
    text = transferColonMatch[1].trim()
  }

  // Iteratively strip office prefixes (e.g. "GSO:", "PGO:", "BAC:") and status/remarks prefixes
  // (e.g. "APPROVED:", "RETURNED:", "Remarks:", "Info:", "Note:")
  let prev = ''
  while (prev !== text) {
    prev = text
    text = text
      .replace(/^(?:[A-Za-z0-9_ -]{1,15}:|approved:|returned:|submitted:|remarks?:|info:|note:)\s*/i, '')
      .trim()
  }

  if (text) {
    return text
  }

  // Fallback if stripping eliminated everything (e.g. input was just "Approved:" or "Returned:")
  if (/returned/i.test(original)) return 'Returned'
  if (/approved/i.test(original)) return 'Approved'
  return original
}
