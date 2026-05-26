// Domain types mirroring the Supabase schema (03_petty_cash_schema.sql).

export type Role = "crew" | "admin";

export type Confidence = "high" | "medium" | "low";

export type ReceiptStatus = "submitted" | "verified" | "void";

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface Department {
  id: string;
  code: string;
  name: string;
  display_order: number;
  active: boolean;
}

export interface LineItem {
  description: string;
  amount: number;
}

export interface Receipt {
  id: string;
  user_id: string;
  image_path: string;
  vendor: string | null;
  receipt_date: string | null;
  amount_total: number | null;
  currency: string;
  department_id: string | null;
  notes: string | null;
  line_items: LineItem[] | null;
  ai_extraction: unknown;
  ai_confidence: Confidence | null;
  status: ReceiptStatus;
  created_at: string;
  updated_at: string;
}

// Shape returned by /api/extract and Claude's vision response.
export interface Extraction {
  vendor: string | null;
  receipt_date: string | null;
  amount_total: number | null;
  currency: string;
  line_items: LineItem[];
  confidence: Confidence;
  notes: string | null;
}
