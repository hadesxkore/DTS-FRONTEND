import ApprovalsPage from "../../admin/pages/ApprovalsPage"

/**
 * ReceivedTransferPage - Dedicated page for Received/Transfer workflow
 * 
 * Shows documents that have been transferred to the current office.
 * Users can:
 * - Receive documents (mark as received)
 * - Transfer documents to other offices
 * - View history of transactions
 */
export default function ReceivedTransferPage({
  officePrivileges,
  transferredPendingOnly = false,
  transferredToOfficeOnly = false,
}: {
  officePrivileges?: string[]
  transferredPendingOnly?: boolean
  transferredToOfficeOnly?: boolean
}) {
  return (
    <ApprovalsPage
      title={transferredPendingOnly || transferredToOfficeOnly ? "Transferred Documents" : "Received / Transfer History"}
      actionMode="logsOnly"
      logsOnlyActionMode="full"
      filterReceivedOnly
      requireTransferLog
      excludeTerminalStatuses
      excludeTransferPending={!transferredPendingOnly && !transferredToOfficeOnly}
      filterTransferredToCurrentOfficeOnly={transferredToOfficeOnly}
      filterTransferredPendingOnly={transferredPendingOnly}
      officePrivileges={officePrivileges}
    />
  )
}
