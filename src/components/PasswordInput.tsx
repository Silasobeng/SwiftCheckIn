'use client';
import { useState } from 'react';

// A plain <input type="password"> with a reveal toggle, used everywhere a
// password is typed (login, signup x2). Pulled into one component rather
// than repeated three times so the eye icon, its accessible label, and the
// extra right-padding needed to keep typed text from running under the
// button all come from a single place.
export default function PasswordInput({
  className = 'input',
  style,
  value,
  onChange,
  placeholder,
  required,
  autoComplete,
  autoFocus,
}: {
  className?: string;
  style?: React.CSSProperties;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <input
        className={className}
        style={{ paddingRight: 44, ...style }}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        tabIndex={-1}
        style={{
          position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
          width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', cursor: 'pointer', color: '#A89D8E', borderRadius: 8,
        }}
      >
        {visible ? (
          // Eye-off — password is currently shown as plain text
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3l18 18M10.6 10.6a2.5 2.5 0 003.5 3.5M9.5 5.2A9.8 9.8 0 0112 5c5 0 9 4.5 10 7-.4 1.1-1.2 2.4-2.3 3.6M6.2 6.6C4.2 8 2.9 9.8 2 12c1 2.5 5 7 10 7 1.2 0 2.4-.3 3.5-.7" />
          </svg>
        ) : (
          // Eye — password is currently hidden
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="2.8" />
          </svg>
        )}
      </button>
    </div>
  );
}
