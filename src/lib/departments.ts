// Per-department badge colors, keyed by the department `code` from the schema.
// Falls back to slate for anything unrecognized.
const STYLES: Record<string, string> = {
  interior: "bg-violet-100 text-violet-800",
  exterior: "bg-sky-100 text-sky-800",
  fnb: "bg-amber-100 text-amber-800",
  engineering: "bg-rose-100 text-rose-800",
  bridge: "bg-emerald-100 text-emerald-800",
};

export function departmentBadgeClass(code: string | undefined | null): string {
  if (!code) return "bg-slate-100 text-slate-700";
  return STYLES[code] ?? "bg-slate-100 text-slate-700";
}
