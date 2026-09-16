/**
 * Desktop Notification & Audio Alert Utility
 * Uses HTML5 Web Notifications API and Web Audio API
 */

import { toast } from './toast';

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        sharedAudioCtx = new AudioContextClass();
      }
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

// Auto-unlock AudioContext on first user interaction anywhere on the window
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        void ctx.resume();
      }
    } catch {
      // ignore
    }
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
  };
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
}

export function isDesktopNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission {
  if (!isDesktopNotificationSupported()) return 'denied';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isDesktopNotificationSupported()) return 'denied';
  try {
    // Unlock audio context on permission click gesture
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      playNotificationSound();
      showDesktopNotification({
        title: '🔔 Desktop Notifications Active',
        body: 'You will now receive instant desktop alerts with sound for all document updates.',
        playSound: false,
      });
      toast.success('Desktop notifications enabled successfully!');
    } else if (permission === 'denied') {
      toast.error('Notification permission was blocked. Please enable it in your browser settings.');
    }
    return permission;
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return Notification.permission;
  }
}

let audioNotificationElement: HTMLAudioElement | null = null;

function getNotificationAudioElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioNotificationElement) {
      audioNotificationElement = new Audio('/sound/notification.mp3');
      audioNotificationElement.preload = 'auto';
    }
    return audioNotificationElement;
  } catch {
    return null;
  }
}

// Preload the sound on user interaction
if (typeof window !== 'undefined') {
  const preloadAudio = () => {
    try {
      const el = getNotificationAudioElement();
      if (el) {
        el.load();
      }
    } catch {
      // ignore
    }
    window.removeEventListener('click', preloadAudio);
    window.removeEventListener('keydown', preloadAudio);
  };
  window.addEventListener('click', preloadAudio, { passive: true, once: true });
  window.addEventListener('keydown', preloadAudio, { passive: true, once: true });
}

/**
 * Plays the notification sound from the Sound folder (/sound/notification.mp3).
 * Falls back to synthesized bell chime if audio playback is blocked or fails.
 */
export function playNotificationSound() {
  try {
    const audio = getNotificationAudioElement();
    if (audio) {
      audio.currentTime = 0;
      audio.volume = 0.9;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // If HTMLAudioElement play fails, fallback to Web Audio API synthesized bell
          playSynthesizedBell();
        });
      }
      return;
    }
  } catch {
    // fallback
  }

  playSynthesizedBell();
}

function playSynthesizedBell() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    const oscMain = ctx.createOscillator();
    const gainMain = ctx.createGain();
    oscMain.type = 'sine';
    oscMain.frequency.setValueAtTime(1046.5, now);

    gainMain.gain.setValueAtTime(0, now);
    gainMain.gain.linearRampToValueAtTime(0.28, now + 0.005);
    gainMain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);

    oscMain.connect(gainMain);
    gainMain.connect(ctx.destination);
    oscMain.start(now);
    oscMain.stop(now + 0.85);

    const oscOvertone = ctx.createOscillator();
    const gainOvertone = ctx.createGain();
    oscOvertone.type = 'sine';
    oscOvertone.frequency.setValueAtTime(2093, now);

    gainOvertone.gain.setValueAtTime(0, now);
    gainOvertone.gain.linearRampToValueAtTime(0.1, now + 0.003);
    gainOvertone.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

    oscOvertone.connect(gainOvertone);
    gainOvertone.connect(ctx.destination);
    oscOvertone.start(now);
    oscOvertone.stop(now + 0.3);
  } catch {
    // ignore
  }
}

export interface DesktopNotificationOptions {
  title: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: unknown;
  playSound?: boolean;
  onClick?: () => void;
}

const recentNotifTags = new Map<string, number>()

/**
 * Displays a native desktop notification and plays an audio alert.
 */
export function showDesktopNotification(options: DesktopNotificationOptions): Notification | null {
  // ── Deduplication ──────────────────────────────────────────────────────────
  // Multiple socket connections can fire the same event simultaneously.
  // Suppress duplicate notifications for the same tag within 2 seconds.
  const DEDUP_MS = 2000
  if (options.tag) {
    const last = recentNotifTags.get(options.tag)
    if (last && Date.now() - last < DEDUP_MS) return null
    recentNotifTags.set(options.tag, Date.now())
    // Prune old entries
    for (const [k, ts] of recentNotifTags.entries()) {
      if (Date.now() - ts > DEDUP_MS * 3) recentNotifTags.delete(k)
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  // Always play the chime sound
  if (options.playSound !== false) {
    playNotificationSound()
  }

  if (!isDesktopNotificationSupported()) return null;

  if (Notification.permission === 'granted') {
    try {
      const notif = new Notification(options.title, {
        body: options.body || '',
        icon: options.icon || '/images/Bataan.png',
        badge: options.badge || '/images/Bataan.png',
        tag: options.tag,
        data: options.data,
      });

      notif.onclick = () => {
        window.focus();
        options.onClick?.();
        notif.close();
      };

      return notif;
    } catch (err) {
      console.warn('Native notification instantiation error:', err);
      return null;
    }
  }

  return null;
}
