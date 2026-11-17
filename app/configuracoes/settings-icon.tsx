import type { ReactNode } from "react";

const icons = {
  settings: <><path d="M9.7 3.2h4.6l.6 2.2 2 .9 2-.7 2 3.5-1.6 1.6v2.6l1.6 1.6-2 3.5-2-.7-2 .9-.6 2.2H9.7l-.6-2.2-2-.9-2 .7-2-3.5 1.6-1.6v-2.6L3.1 9.1l2-3.5 2 .7 2-.9z" /><circle cx="12" cy="12" r="2.8" /></>,
  user: <><circle cx="12" cy="8" r="3.4" /><path d="M5 20v-1.5a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5V20" /></>,
  shield: <><path d="m12 22 3.6-2.5a9 9 0 0 0 3.9-7.4V5.8L12 3 4.5 5.8v6.3a9 9 0 0 0 3.9 7.4z" /><path d="m9 12 2 2 4-4" /></>,
  key: <><path d="m9.6 13.5-6.1 6.1V22h2.6l1.7-1.7v-1.7h1.7l2.4-2.4a6 6 0 1 0-2.3-2.7Z" /><circle cx="16.2" cy="8" r="1.2" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
  file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8m-8 4h6" /></>,
  building: <><path d="M4 21V5h11v16m0-13h5v13M2 21h20m-13 0v-4" /><path d="M8 9h3m-3 4h3m6-1h1m-1 4h1" /></>,
  network: <><rect x="9.5" y="3" width="5" height="5" rx="1" /><rect x="2.5" y="16" width="5" height="5" rx="1" /><rect x="9.5" y="16" width="5" height="5" rx="1" /><rect x="16.5" y="16" width="5" height="5" rx="1" /><path d="M12 8v8m-7 0v-4h14v4" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M2.5 20v-2.5a4.5 4.5 0 0 1 4.5-4.5h4a4.5 4.5 0 0 1 4.5 4.5V20m1-14.8a3 3 0 0 1 0 5.8m1.5 2.2a4.5 4.5 0 0 1 3.5 4.3V20" /></>,
  landmark: <path d="M3 9 12 4l9 5H3Zm1 11h16M6 10v7m4-7v7m4-7v7m4-7v7" />,
  folder: <path d="M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  ledger: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 16h8m-2.5-8H11a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 1 0 3h-2.5M12 7v8" /></>,
  wallet: <><path d="M20 9V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-2" /><path d="M16 9h5v7h-5a3.5 3.5 0 0 1 0-7Zm.5 3.5h.01" /></>,
  list: <><rect x="4.5" y="4" width="15" height="16" rx="2" /><path d="M8.5 9h7m-7 4h7m-7 4H12" /></>,
  checklist: <path d="m3 7 1 1 2-2m-3 6 1 1 2-2m-3 6 1 1 2-2m3-8h12m-12 5h12m-12 5h12" />,
  plug: <path d="M8 3v5m8-5v5M6 8h12v4a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5Zm6 9v4" />,
  car: <><path d="m5 10 2-5h10l2 5m2 7v2m-18-2v2" /><rect x="3" y="10" width="18" height="7" rx="2" /><path d="M7 13.5h.01m10 0h.01" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.4" /><path d="m16 16 4 4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  pencil: <path d="M13.5 6.5 17.5 10.5M4 16l-1 5 5-1L20 8a2.8 2.8 0 0 0-4-4z" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
} satisfies Record<string, ReactNode>;

export default function SettingsIcon({ name, size = 17 }: { name: keyof typeof icons; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{icons[name]}</svg>;
}
