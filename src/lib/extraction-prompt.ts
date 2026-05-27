// Default guidance for the `notes` field. Admins can override this in-app
// (stored in app_settings.notes_instruction) — see /admin/ai-notes.
export const DEFAULT_NOTES_INSTRUCTION =
  "A brief, plain-language description of what the expense was for — the goods or services purchased (for example: groceries and bottled water for the galley; diesel fuel; hardware and rigging supplies). For restaurant or bar receipts, give the establishment name, its location, and the tip amount if shown. Summarize the category of what was bought rather than the payment method or card number.";

// Builds the full extraction prompt, injecting the (admin-editable) guidance
// for the notes field. The rest of the schema is fixed.
export function buildExtractionPrompt(notesInstruction?: string | null): string {
  const notes = (notesInstruction?.trim() || DEFAULT_NOTES_INSTRUCTION)
    // Keep the embedded instruction from breaking the JSON-shaped prompt.
    .replace(/"/g, "'")
    .replace(/\s+/g, " ");

  return `You are reading a receipt photo for a yacht's petty cash log. Extract the following as JSON:

{
  "vendor": "string — business or merchant name, null if unclear",
  "receipt_date": "YYYY-MM-DD, null if unclear",
  "amount_total": number — the total amount paid, null if unclear,
  "currency": "ISO 4217 code, default USD if not indicated",
  "line_items": [{"description": "string", "amount": number}] — empty array if unclear,
  "confidence": "high | medium | low — your overall confidence in the extraction",
  "notes": "${notes}"
}

Return only the JSON. No prose, no markdown fences.

If the image is not a receipt, return: {"error": "not_a_receipt"}`;
}
