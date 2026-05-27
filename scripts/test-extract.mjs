// One-off: run an image through the SAME model + prompt the app uses, to
// demonstrate extraction accuracy. Usage: node scripts/test-extract.mjs <img>
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const EXTRACTION_PROMPT = `You are reading a receipt photo for a yacht's petty cash log. Extract the following as JSON:

{
  "vendor": "string — business or merchant name, null if unclear",
  "receipt_date": "YYYY-MM-DD, null if unclear",
  "amount_total": number — the total amount paid, null if unclear,
  "currency": "ISO 4217 code, default USD if not indicated",
  "line_items": [{"description": "string", "amount": number}] — empty array if unclear,
  "confidence": "high | medium | low — your overall confidence in the extraction",
  "notes": "A brief, plain-language description of what the expense was for — the goods or services purchased (for example: groceries and bottled water for the galley; diesel fuel; hardware and rigging supplies). For restaurant or bar receipts, give the establishment name, its location, and the tip amount if shown. Summarize the category of what was bought rather than the payment method or card number."
}

Return only the JSON. No prose, no markdown fences.

If the image is not a receipt, return: {"error": "not_a_receipt"}`;

const file = process.argv[2];
const b64 = readFileSync(file).toString("base64");
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const msg = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  messages: [
    {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
        { type: "text", text: EXTRACTION_PROMPT },
      ],
    },
  ],
});

const text = msg.content.find((b) => b.type === "text")?.text ?? "";
console.log(text);
