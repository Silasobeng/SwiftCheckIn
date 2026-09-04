'use client';

import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    try {
      if (sessionStorage.getItem('pwa-dismissed')) return;
    } catch {}

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const install = async () => {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
    setDismissed(true);
  };

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem('pwa-dismissed', '1'); } catch {}
  };

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: 16, right: 16,
      background: '#16243A', color: '#fff', borderRadius: 14,
      padding: '14px 16px', display: 'flex', alignItems: 'center',
      gap: 12, zIndex: 9999, boxShadow: '0 4px 24px rgba(0,0,0,.25)',
      maxWidth: 420, margin: '0 auto',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Install WeMotiply</div>
        <div style={{ fontSize: 12, opacity: .75 }}>Add to home screen for quick access</div>
      </div>
      <button onClick={install} style={{
        background: '#F0A832', color: '#16243A', border: 'none', borderRadius: 8,
        padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}>Install</button>
      <button onClick={dismiss} aria-label="Dismiss" style={{
        background: 'none', border: 'none', color: '#fff', opacity: .5,
        fontSize: 18, cursor: 'pointer', padding: 4, lineHeight: 1,
      }}>x</button>
    </div>
  );
}
