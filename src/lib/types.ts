// Domain types mirroring the Supabase schema (03_petty_cash_schema.sql).

export type Role = "crew" | "admin";

export type Confidence = "high" | "medium" | "low";

export type ReceiptStatus = "submitted" | "verified" | "void";

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;
export type Currency = (typeof CURRENCIES)[number];

// Categories let the receipts list filter by what was bought (e.g. all
// restaurants, all supplies). The AI extraction assigns one; users can
// override in the receipt form.
export const CATEGORIES = [
  "restaurant",
  "groceries",
  "fuel",
  "supplies",
  "hardware",
  "services",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  restaurant: "Restaurant",
  groceries: "Groceries",
  fuel: "Fuel",
  supplies: "Supplies",
  hardware: "Hardware",
  services: "Services",
  other: "Other",
};

export interface Department {
  id: string;
  code: string;
  name: string;
  display_order: number;
  active: boolean;
}

export interface Client {
  id: string;
  name: string;
  is_overhead: boolean;
  active: boolean;
  display_order: number;
}

export interface LineItem {
  description: string;
  amount: number;
}

export interface Receipt {
  id: string;
  user_id: string;
  image_path: string | null;
  vendor: string | null;
  receipt_date: string | null;
  amount_total: number | null;
  currency: string;
  department_id: string | null;
  category: Category;
  notes: string | null;
  client_id: string | null;
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
