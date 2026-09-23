import { useEffect, useRef, useCallback } from 'react';
import {
  showDesktopNotification,
  requestNotificationPermission,
  getNotificationPermission,
  isDesktopNotificationSupported,
  playNotificationSound,
} from '../lib/desktopNotification';
import { toast } from '../lib/toast';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySocket = any;

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

export {
  showDesktopNotification,
  requestNotificationPermission,
  getNotificationPermission,
  isDesktopNotificationSupported,
  playNotificationSound,
};

export type DocumentEventData = {
  document: any;
  changes?: string[];
  updatedBy?: string;
  timestamp?: string;
};

export type DocumentDeletedData = { documentId: string };

export type SocketEventHandlers = {
  onDocumentCreated?: (data: DocumentEventData) => void;
  onDocumentUpdated?: (data: DocumentEventData) => void;
  onDocumentDeleted?: (data: DocumentDeletedData) => void;
  onReturnRequested?: (data: any) => void;
  onAdminNotification?: (data: any) => void;
  onOfficeNotification?: (data: any) => void;
  onUserNotification?: (data: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
};

// ── Formatters for Rich Desktop Notifications ─────────────────────────────────

export function formatPeso(val: any): string {
  if (val === undefined || val === null || val === '') return '0.00';
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
  if (isNaN(num)) return String(val);
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDateTime(val?: any): string {
  const d = val ? new Date(val) : new Date();
  if (isNaN(d.getTime())) return new Date().toLocaleString();
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${dateStr} • ${timeStr}`;
}

export function formatStage(statusRaw?: string, logs?: any[]): string {
  const s = String(statusRaw || '').trim().toLowerCase();
  if (!s || ['pending', 'pending-gso', 'for-validation', 'pre-validation'].includes(s)) {
    return 'Pre-Validation (Pending GSO)';
  }
  if (s === 'pending-bac') return 'Pre-Validation (Pending BAC)';
  if (s === 'ready-transfer') return 'Ready for Transfer';
  if (s === 'in-budget') return 'Ongoing (Budget)';
  if (s === 'in-pto') return 'Ongoing (PTO)';
  if (s === 'ongoing') {
    if (Array.isArray(logs)) {
      for (let i = logs.length - 1; i >= 0; i--) {
        const lbl = String(logs[i]?.label || '').trim().toLowerCase();
        if (lbl.startsWith('transferred to')) {
          const dest = lbl.replace('transferred to', '').trim().toUpperCase();
          return `Ongoing (${dest})`;
        }
      }
    }
    return 'Ongoing';
  }
  if (s === 'completed' || s === 'approved') return 'Completed';
  if (s === 'discontinued') return 'Discontinued';
  if (s === 'returned') return 'Returned';
  if (s === 'for-revision') return 'For Revision';
  return statusRaw || 'Pre-Validation';
}

/**
 * Extracts a human-readable action summary from the latest log entry.
 * Returns an object with:
 *   - actionLine: short action description (e.g. "Received by BUDGET", "Transferred to PTO")
 *   - taskLine:   task/remarks if present (e.g. "Task: Review documents")
 *   - byLine:     who did it (e.g. "By: Juan dela Cruz (BUDGET)")
 */
export function formatLatestAction(logs?: any[]): {
  actionLine: string;
  taskLine: string;
  byLine: string;
} {
  const empty = { actionLine: '', taskLine: '', byLine: '' };
  if (!Array.isArray(logs) || logs.length === 0) return empty;

  const last = logs[logs.length - 1];
  const rawLabel = String(last?.label || '').trim();
  const byOffice = String(last?.byOffice || '').trim().toUpperCase();
  const byUser   = String(last?.byUser  || '').trim();
  if (!rawLabel) return empty;

  const labelLower = rawLabel.toLowerCase();

  // ── Classify action ────────────────────────────────────────────────────────
  let actionLine = '';
  let taskLine   = '';

  if (labelLower.startsWith('transferred to')) {
    const afterTo  = rawLabel.slice('Transferred to'.length).trim();
    const officeMatch = afterTo.match(/^([^(:\n]+)/);
    const destOffice  = officeMatch ? officeMatch[1].trim().toUpperCase() : afterTo.toUpperCase();
    const taskMatch = afterTo.match(/\(([^)]+)\)/);
    const taskText  = taskMatch ? taskMatch[1].replace(/^task:\s*/i, '').trim() : '';
    actionLine = `📤 Transferred to ${destOffice}`;
    if (taskText) taskLine = `Task: ${taskText}`;

  } else if (labelLower.startsWith('received by') || labelLower.startsWith('received at')) {
    const afterBy  = rawLabel.replace(/^received\s+(?:by|at)\s*/i, '').trim();
    const colonIdx = afterBy.indexOf(':');
    const officePart = colonIdx >= 0 ? afterBy.slice(0, colonIdx).trim().toUpperCase() : afterBy.toUpperCase();
    const taskPart   = colonIdx >= 0 ? afterBy.slice(colonIdx + 1).trim() : '';
    actionLine = `📥 Received by ${officePart}`;
    if (taskPart) taskLine = `Task: ${taskPart}`;

  } else if (labelLower.startsWith('approved')) {
    actionLine = `✅ Approved`;
    const colonIdx = rawLabel.indexOf(':');
    if (colonIdx >= 0) taskLine = rawLabel.slice(colonIdx + 1).trim();

  } else if (labelLower.startsWith('returned')) {
    actionLine = `↩️ Returned`;
    const colonIdx = rawLabel.indexOf(':');
    if (colonIdx >= 0) taskLine = rawLabel.slice(colonIdx + 1).trim();

  } else if (labelLower.startsWith('discontinued')) {
    actionLine = `🚫 Discontinued`;

  } else if (labelLower.startsWith('completed')) {
    actionLine = `✅ Completed`;

  } else if (labelLower.startsWith('submitted')) {
    actionLine = `📄 Submitted`;

  } else if (labelLower.startsWith('returned to approvals')) {
    actionLine = `↩️ Returned to Approvals`;
    const colonIdx = rawLabel.indexOf(':');
    if (colonIdx >= 0) taskLine = rawLabel.slice(colonIdx + 1).trim();

  } else if (labelLower.startsWith('remarks')) {
    actionLine = `💬 Remarks`;
    const colonIdx = rawLabel.indexOf(':');
    if (colonIdx >= 0) taskLine = rawLabel.slice(colonIdx + 1).trim();

  } else {
    const taskMatch = rawLabel.match(/\(([^)]+)\)$/);
    actionLine = taskMatch ? rawLabel.slice(0, rawLabel.lastIndexOf('(')).trim() : rawLabel;
    if (taskMatch) taskLine = `Task: ${taskMatch[1].replace(/^task:\s*/i, '').trim()}`;
  }

  // ── By line ────────────────────────────────────────────────────────────────
  let byLine = '';
  if (byUser && byOffice) {
    byLine = `By: ${byUser} (${byOffice})`;
  } else if (byUser) {
    byLine = `By: ${byUser}`;
  } else if (byOffice) {
    byLine = `By: ${byOffice}`;
  }

  return { actionLine, taskLine, byLine };
}

export function buildDetailedNotificationBody(doc: any, customReason?: string): string {
  if (!doc) return '';

  const office = doc.office || doc.department || 'N/A';
  const user =
    (typeof doc.createdBy === 'string' && doc.createdBy.trim()) ||
    (typeof doc.submittedBy === 'string' && doc.submittedBy.trim()) ||
    (Array.isArray(doc.logs) && doc.logs[0]?.byUser ? String(doc.logs[0].byUser).trim() : '') ||
    'N/A';

  const fund = doc.fund || doc.sourceOfFund || 'General Fund';
  const amountStr = doc.amount ? `₱ ${formatPeso(doc.amount)}` : '₱ 0.00';
  const stage = formatStage(doc.status, doc.logs);
  const dt = formatDateTime(doc.createdAt || doc.timestamp || Date.now());
  const purpose = doc.purpose ? String(doc.purpose).trim() : '';

  const lines = [
    `🏢 Office: ${office} | 👤 User: ${user}`,
    `💰 Fund: ${fund} (${amountStr})`,
    `📊 Stage: ${stage}`,
    `🕒 Date & Time: ${dt}`,
  ];

  if (customReason) {
    lines.push(`💬 Reason: ${customReason}`);
  } else if (purpose) {
    lines.push(`📝 Purpose: ${purpose}`);
  }

  return lines.join('\n');
}

export function useSocket(
  userId?: string,
  office?: string,
  role?: string,
  handlers?: SocketEventHandlers,
  secondaryUserId?: string
) {
  const socketRef = useRef<AnySocket | null>(null);
  const handlersRef = useRef(handlers);

  // Keep handlers ref up to date
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    // Dynamic import socket.io-client
    let socket: AnySocket | null = null;
    let isActive = true;

    const initSocket = async () => {
      try {
        const { io } = await import('socket.io-client');
        if (!isActive) return;

        // Create socket connection
        socket = io(SOCKET_URL, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
        });

        socketRef.current = socket;

        // Connection events
        socket.on('connect', () => {
          console.log('Socket connected:', socket?.id);

          // Join rooms based on user info
          if (office) {
            socket?.emit('join-office', office);
            const offUpper = office.toUpperCase();
            if (offUpper.includes('GENERAL SERVICES') || offUpper === 'GSO') {
              socket?.emit('join-office', 'GSO');
              socket?.emit('join-office', 'OFFICE OF THE PROVINCIAL GENERAL SERVICES');
              socket?.emit('join-office', 'GENERAL SERVICES OFFICE');
            }
            if (offUpper.includes('BUDGET')) {
              socket?.emit('join-office', 'BUDGET');
              socket?.emit('join-office', 'PROVINCIAL BUDGET OFFICE');
              socket?.emit('join-office', 'OFFICE OF THE PROVINCIAL BUDGET OFFICER');
            }
            if (offUpper.includes('PTO') || offUpper.includes('TREASURER')) {
              socket?.emit('join-office', 'PTO');
              socket?.emit('join-office', 'PROVINCIAL TREASURERS OFFICE');
              socket?.emit('join-office', "PROVINCIAL TREASURER'S OFFICE");
              socket?.emit('join-office', 'OFFICE OF THE PROVINCIAL TREASURER');
            }
            if (offUpper.includes('BAC') || offUpper.includes('BIDS AND AWARDS')) {
              socket?.emit('join-office', 'BAC');
              socket?.emit('join-office', 'BIDS AND AWARDS COMMITTEE');
            }
          }
          if (role) {
            socket?.emit('join-role', role);
          }
          if (userId) {
            socket?.emit('join-user', userId);
          }
          if (secondaryUserId && secondaryUserId !== userId) {
            socket?.emit('join-user', secondaryUserId);
          }

          handlersRef.current?.onConnect?.();
        });

        socket.on('disconnect', (reason: string) => {
          console.log('Socket disconnected:', reason);
          handlersRef.current?.onDisconnect?.();
        });

        socket.on('connect_error', (error: Error) => {
          console.error('Socket connection error:', error);
        });

        // ── Document Created (Data refresh only - no global toast to everyone) ─────
        socket.on('document:created', (data: DocumentEventData) => {
          console.log('Document created event received:', data.document?.trackingNo);
          handlersRef.current?.onDocumentCreated?.(data);
        });

        // ── Document Updated (Data refresh only - no global toast to everyone) ─────
        socket.on('document:updated', (data: DocumentEventData) => {
          console.log('Document updated event received:', data.document?.trackingNo);
          handlersRef.current?.onDocumentUpdated?.(data);
        });

        // ── Document Deleted ────────────────────────────────────────────────
        socket.on('document:deleted', (data: DocumentDeletedData) => {
          console.log('Document deleted:', data.documentId);
          handlersRef.current?.onDocumentDeleted?.(data);
        });

        // ── Return to Approvals Requested (Admin targeted) ──────────────────
        socket.on('document:return_requested', (data: any) => {
          console.log('Return requested event received:', data?.trackingNo);
          const tracking = data?.trackingNo || data?.document?.trackingNo || '';
          const byUser = data?.byUser ? ` by ${data.byUser}` : '';
          const reason = data?.reason ? ` (${data.reason})` : '';

          showDesktopNotification({
            title: `↩️ Return Requested: #${tracking}`,
            body: `Document #${tracking} was requested to return to approvals${byUser}${reason}`,
            tag: `doc-return-${data?.documentId || tracking}`,
          });

          toast.info(`↩️ Return requested for #${tracking}${byUser}`);
          handlersRef.current?.onReturnRequested?.(data);
        });

        // ── Admin Notifications ─────────────────────────────────────────────
        socket.on('notification:admin', (data: any) => {
          console.log('Admin notification event received:', data?.title);
          handlersRef.current?.onAdminNotification?.(data);
        });

        // ── Office-targeted Notifications (only shown to office room members) ─
        socket.on('notification:office', (data: any) => {
          console.log('Office notification received:', data?.title);
          const title = data?.title || '📨 Office Notification';
          const message = data?.message || '';

          showDesktopNotification({
            title,
            body: message,
            tag: `office-notif-${data?.trackingNo || Date.now()}`,
          });

          toast.info(`${title}: ${message}`);
          handlersRef.current?.onOfficeNotification?.(data);
        });

        // ── User-targeted Notifications (targeted specifically to document owner) ──
        socket.on('notification:user', (data: any) => {
          console.log('User targeted notification event received:', data?.title);
          const title = data?.title || '🔔 Notification';
          const message = data?.message || '';

          showDesktopNotification({
            title,
            body: message,
            tag: `user-notif-${data?.trackingNo || Date.now()}`,
          });

          toast.info(`${title}: ${message}`);
          handlersRef.current?.onUserNotification?.(data);
        });

      } catch (error) {
        console.error('Failed to initialize socket:', error);
      }
    };

    void initSocket();

    // Cleanup on unmount
    return () => {
      isActive = false;
      if (socket) {
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [userId, secondaryUserId, office, role]);

  // Method to manually emit events
  const emit = useCallback((event: string, data: any) => {
    socketRef.current?.emit(event, data);
  }, []);

  return {
    socket: socketRef.current,
    emit,
    isConnected: socketRef.current?.connected ?? false,
    requestNotificationPermission,
    getNotificationPermission,
  };
}

// Hook specifically for document-related real-time updates
export function useDocumentSocket(
  userContext: { userId?: string; office?: string; role?: string; fullName?: string; username?: string },
  onDocumentsChange?: (action: 'created' | 'updated' | 'deleted' | 'return_requested', data: any) => void
) {
  const handlers: SocketEventHandlers = {
    onDocumentCreated: (data) => onDocumentsChange?.('created', data),
    onDocumentUpdated: (data) => onDocumentsChange?.('updated', data),
    onDocumentDeleted: (data) => onDocumentsChange?.('deleted', data as DocumentDeletedData),
    onReturnRequested: (data) => onDocumentsChange?.('return_requested', data),
    onAdminNotification: (data) => onDocumentsChange?.('return_requested', data),
    onOfficeNotification: (data) => onDocumentsChange?.('updated', data),
    onUserNotification: (data) => onDocumentsChange?.('updated', data),
  };

  const primaryId = userContext.fullName || userContext.userId || userContext.username;
  const secondaryId = userContext.username && userContext.username !== primaryId ? userContext.username : undefined;

  const { socket, isConnected, requestNotificationPermission, getNotificationPermission } = useSocket(
    primaryId,
    userContext.office,
    userContext.role,
    handlers,
    secondaryId
  );

  return { socket, isConnected, requestNotificationPermission, getNotificationPermission };
}
