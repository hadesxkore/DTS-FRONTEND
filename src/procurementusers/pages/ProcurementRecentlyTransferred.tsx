import ApprovalsPage from "../../admin/pages/ApprovalsPage"

/**
 * ProcurementRecentlyTransferred - Dedicated page for Recently Transferred documents
 *
 * Shows documents that were recently transferred out of the current office.
 * To update the filter behaviour, edit the ApprovalsPage props below.
 */
export default function ProcurementRecentlyTransferred({
    officePrivileges,
}: {
    officePrivileges?: string[]
}) {
    return (
        <ApprovalsPage
            title="Recently Transferred"
            actionMode="logsOnly"
            logsOnlyActionMode="full"
            filterRecentlyTransferredOnly
            officePrivileges={officePrivileges}
        />
    )
}