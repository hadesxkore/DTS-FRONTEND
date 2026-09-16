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

type DocumentEventData = {
  document: any;
  changes?: string[];
  updatedBy?: string;
  timestamp?: string;
};

type DocumentDeletedData = { documentId: string };

type SocketEventHandlers = {
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
    // "Transferred to BUDGET (Task: Review)" or "Transferred to PTO"
    const afterTo  = rawLabel.slice('Transferred to'.length).trim();
    // Extract office: text before '(' or end
    const officeMatch = afterTo.match(/^([^(:\n]+)/);
    const destOffice  = officeMatch ? officeMatch[1].trim().toUpperCase() : afterTo.toUpperCase();
    // Extract task from parens: (Task: ...) or just (...)
    const taskMatch = afterTo.match(/\(([^)]+)\)/);
    const taskText  = taskMatch ? taskMatch[1].replace(/^task:\s*/i, '').trim() : '';
    actionLine = `📤 Transferred to ${destOffice}`;
    if (taskText) taskLine = `Task: ${taskText}`;

  } else if (labelLower.startsWith('received by') || labelLower.startsWith('received at')) {
    // "Received by BUDGET: Task name" or "Received by BUDGET"
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
    // Generic fallback: use the label as-is, strip task from parens if present
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
  // Always use the user who submitted/uploaded the request (createdBy)
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
  handlers?: SocketEventHandlers
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
          }
          if (role) {
            socket?.emit('join-role', role);
          }
          if (userId) {
            socket?.emit('join-user', userId);
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

        // ── Document Created ────────────────────────────────────────────────
        socket.on('document:created', (data: DocumentEventData) => {
          console.log('Document created event received:', data.document?.trackingNo);
          const doc = data.document || {};
          const trackingNo = doc.trackingNo || 'Document';
          const detailedBody = buildDetailedNotificationBody(doc);

          // Play sound and trigger desktop notification with all details
          showDesktopNotification({
            title: `📄 New Request: #${trackingNo}`,
            body: detailedBody,
            tag: `doc-created-${doc._id || trackingNo}`,
          });

          // In-app visual toast with key summary
          const officeName = doc.office ? ` (${doc.office})` : '';
          const stage = formatStage(doc.status, doc.logs);
          toast.info(`🔔 New Request #${trackingNo}${officeName} • ${stage}`);

          handlersRef.current?.onDocumentCreated?.(data);
        });

        // ── Document Updated ────────────────────────────────────────────────
        socket.on('document:updated', (data: DocumentEventData) => {
          console.log('Document updated event received:', data.document?.trackingNo);
          const doc = data.document || {};
          const trackingNo = doc.trackingNo || '';
          const detailedBody = buildDetailedNotificationBody(doc);

          // Build a rich toast message showing the latest action
          const { actionLine, taskLine, byLine } = formatLatestAction(doc.logs);
          const parts: string[] = [`#${trackingNo}`];
          if (actionLine) parts.push(actionLine);
          if (taskLine)   parts.push(taskLine);
          if (byLine)     parts.push(byLine);
          const toastMsg = parts.join(' • ');

          showDesktopNotification({
            title: `🔄 Document Updated: #${trackingNo}`,
            body: detailedBody,
            tag: `doc-updated-${doc._id || trackingNo}`,
          });

          toast.info(toastMsg);

          handlersRef.current?.onDocumentUpdated?.(data);
        });

        // ── Document Deleted ────────────────────────────────────────────────
        socket.on('document:deleted', (data: DocumentDeletedData) => {
          console.log('Document deleted:', data.documentId);
          handlersRef.current?.onDocumentDeleted?.(data);
        });

        // ── Return to Approvals Requested ───────────────────────────────────
        socket.on('document:return_requested', (data: any) => {
          console.log('Return requested event received:', data?.trackingNo);
          const tracking = data?.trackingNo || data?.document?.trackingNo || '';
          const user = data?.requestedBy || data?.document?.createdBy || 'End User';
          const reason = data?.reason || '';
          const doc = data?.document || {
            trackingNo: tracking,
            office: data?.office,
            createdBy: user,
            status: 'pending-gso',
          };

          const detailedBody = buildDetailedNotificationBody(doc, reason);

          showDesktopNotification({
            title: `↩️ Return to Approvals Requested: #${tracking}`,
            body: detailedBody,
            tag: `doc-return-req-${tracking}`,
          });

          toast.info(`↩️ Return to Approvals requested for #${tracking} by ${user}`);

          handlersRef.current?.onReturnRequested?.(data);
        });

        // ── Admin Notifications ─────────────────────────────────────────────
        socket.on('notification:admin', (data: any) => {
          console.log('Admin notification event received:', data?.title);
          const title = data?.title || '🔔 Admin Notification';
          const message = data?.message || `Tracking #${data?.trackingNo || ''}`;

          showDesktopNotification({
            title,
            body: message,
            tag: `admin-notif-${Date.now()}`,
          });

          toast.info(`${title}: ${message}`);

          handlersRef.current?.onAdminNotification?.(data);
        });

        // ── Office-targeted Notifications ───────────────────────────────────
        socket.on('notification:office', (data: any) => {
          console.log('Office notification event received:', data?.title);
          const title = data?.title || '📨 Office Notification';
          const message = data?.message || '';

          showDesktopNotification({
            title,
            body: message,
            tag: `office-notif-${Date.now()}`,
          });

          toast.info(`${title}: ${message}`);

          handlersRef.current?.onOfficeNotification?.(data);
        });

        // ── User-targeted Notifications ─────────────────────────────────────
        socket.on('notification:user', (data: any) => {
          console.log('User notification event received:', data?.title);
          const title = data?.title || '🔔 Notification';
          const message = data?.message || '';

          showDesktopNotification({
            title,
            body: message,
            tag: `user-notif-${Date.now()}`,
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
  }, [userId, office, role]);

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
  userContext: { userId?: string; office?: string; role?: string; fullName?: string },
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

  const { socket, isConnected, requestNotificationPermission, getNotificationPermission } = useSocket(
    userContext.userId,
    userContext.office,
    userContext.role,
    handlers
  );

  return { socket, isConnected, requestNotificationPermission, getNotificationPermission };
}
