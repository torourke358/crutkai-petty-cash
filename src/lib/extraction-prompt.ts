// The receipt-extraction prompt (verbatim from the spec, 02_petty_cash_spec.md).
export const EXTRACTION_PROMPT = `You are reading a receipt photo for a yacht's petty cash log. Extract the following as JSON:

{
  "vendor": "string — business or merchant name, null if unclear",
  "receipt_date": "YYYY-MM-DD, null if unclear",
  "amount_total": number — the total amount paid, null if unclear,
  "currency": "ISO 4217 code, default USD if not indicated",
  "line_items": [{"description": "string", "amount": number}] — empty array if unclear,
  "confidence": "high | medium | low — your overall confidence in the extraction",
  "notes": "string — anything unusual, e.g. handwritten, partially obscured, foreign language"
}

Return only the JSON. No prose, no markdown fences.

If the image is not a receipt, return: {"error": "not_a_receipt"}`;
