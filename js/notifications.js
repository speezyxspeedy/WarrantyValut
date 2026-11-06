/**
 * WarrantyVault — Browser Notification API Integration
 * Handles desktop notification permissions and dispatching with Service Worker fallbacks.
 */

import { getSetting, updateSetting } from './settings.js';
import { toast } from './ui.js';

/**
 * Checks if browser notifications are supported.
 */
export function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Gets current notification permission state: 'default', 'granted', 'denied'
 */
export function getNotificationPermission() {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Requests permission on explicit user click. Never on page load.
 */
export async function requestNotificationPermission() {
  if (!isNotificationSupported()) {
    toast('Notifications are not supported in this browser.', 'warn');
    return 'unsupported';
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await updateSetting('desktopNotifications', true);
      toast('Desktop notifications enabled!', 'success');
      sendDesktopNotification(
        'WarrantyVault Notifications Active',
        'You will receive reminders before warranty deadlines expire.'
      );
    } else {
      await updateSetting('desktopNotifications', false);
      toast(`Notification permission was ${permission}`, 'info');
    }
    return permission;
  } catch (err) {
    console.error('Notification permission error:', err);
    return 'denied';
  }
}

/**
 * Dispatches a desktop notification.
 */
export async function sendDesktopNotification(title, body, tag = 'warranty-reminder') {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  // Try service worker first for background support if available
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body,
          icon: '/assets/logo.svg',
          badge: '/assets/logo.svg',
          tag,
          renotify: false
        });
        return true;
      }
    } catch {
      // fallback
    }
  }

  // Fallback to standard window Notification
  try {
    new Notification(title, {
      body,
      icon: '/assets/logo.svg',
      tag
    });
    return true;
  } catch {
    return false;
  }
}
