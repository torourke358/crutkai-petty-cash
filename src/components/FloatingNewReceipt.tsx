"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Persistent "+ New receipt" action, shown on every screen in the app shell
// except the new-receipt page itself (where it would be redundant).
export default function FloatingNewReceipt() {
  const pathname = usePathname();
  if (pathname === "/receipts/new") return null;

  return (
    <Link
      href="/receipts/new"
      // Lift above the iPhone home indicator via the position, not internal
      // padding, so the label stays vertically centered in the button.
      style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      className="fixed right-6 z-20 flex h-14 items-center justify-center gap-2 rounded-full bg-violet-600 pl-5 pr-6 text-base font-medium text-white shadow-lg shadow-violet-300/50 active:bg-violet-700"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span className="leading-none">New receipt</span>
    </Link>
  );
}
