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
      className="safe-bottom fixed bottom-6 right-6 z-20 flex h-14 items-center gap-2 rounded-full bg-violet-600 px-6 text-base font-medium text-white shadow-lg shadow-violet-300/50 active:bg-violet-700"
    >
      <span className="text-xl leading-none">+</span>
      New receipt
    </Link>
  );
}
