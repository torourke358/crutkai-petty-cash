import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { buildExtractionPrompt } from "@/lib/extraction-prompt";
import { CURRENCIES, CATEGORIES } from "@/lib/types";

const MODEL = "claude-sonnet-4-6";

const IMAGE_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

// Strip ```json fences if the model adds them despite instructions.
function stripFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

type ImageBlock = Anthropic.ImageBlockParam;

async function callClaude(imageSource: ImageBlock["source"], prompt: string) {
  const anthropic = new Anthropic({
    apiKey: (process.env.ANTHROPIC_API_KEY ?? "").replace(/\s/g, ""),
  });
  return anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: imageSource },
          { type: "text", text: prompt },
        ],
      },
    ],
  });
}

export async function POST(request: Request) {
  // Require a logged-in user.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Take a storage path (under the caller's folder) rather than a raw URL —
  // signing happens server-side. Accepting an arbitrary URL would turn this
  // route into a server-side fetch for anywhere on the internet.
  let imagePath: string;
  try {
    ({ image_path: imagePath } = await request.json());
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!imagePath || typeof imagePath !== "string") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!imagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "forbidden_path" }, { status: 403 });
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from("receipts")
    .createSignedUrl(imagePath, 60);
  if (signErr || !signed?.signedUrl) {
    console.error("extract: sign failed", signErr);
    return NextResponse.json({ error: "sign_failed" }, { status: 500 });
  }
  const imageUrl = signed.signedUrl;

  // Load the admin-editable notes guidance (falls back to the default).
  const { data: setting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "notes_instruction")
    .maybeSingle();
  const prompt = buildExtractionPrompt(setting?.value);

  let message;
  try {
    // Prefer passing the URL directly.
    message = await callClaude({ type: "url", url: imageUrl }, prompt);
  } catch {
    // Fall back to fetching + base64 (e.g. signed URL Anthropic can't reach).
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) {
        console.error("extract: refetch failed", res.status);
        return NextResponse.json(
          { error: "extraction_failed", raw: "" },
          { status: 200 },
        );
      }
      const ct = res.headers.get("content-type") ?? "";
      const mediaType = IMAGE_MEDIA_TYPES.find((m) =>
        ct.startsWith(m),
      ) as ImageMediaType | undefined;
      if (!mediaType) {
        console.error("extract: refetch wrong content-type", ct);
        return NextResponse.json(
          { error: "extraction_failed", raw: "" },
          { status: 200 },
        );
      }
      const buf = Buffer.from(await res.arrayBuffer());
      message = await callClaude(
        {
          type: "base64",
          media_type: mediaType,
          data: buf.toString("base64"),
        },
        prompt,
      );
    } catch (err) {
      console.error("extract: anthropic call failed", err);
      return NextResponse.json(
        { error: "extraction_failed", raw: "" },
        { status: 200 },
      );
    }
  }

  const textBlock = message.content.find((b) => b.type === "text");
  const rawText = textBlock && "text" in textBlock ? textBlock.text : "";

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripFences(rawText));
  } catch {
    // Return 200 so the UI can fall back to a blank, manually-filled form.
    return NextResponse.json(
      { error: "extraction_failed", raw: rawText },
      { status: 200 },
    );
  }

  if (parsed.error === "not_a_receipt") {
    return NextResponse.json({ error: "not_a_receipt" }, { status: 200 });
  }

  // Clamp currency to the set the UI offers — the AI sometimes returns codes
  // outside that list (e.g. CHF on a Swiss restaurant receipt), and storing
  // them would either fail at the DB or silently bypass downstream filters.
  const aiCurrency =
    typeof parsed.currency === "string" ? parsed.currency : "";
  const currency = (CURRENCIES as readonly string[]).includes(aiCurrency)
    ? aiCurrency
    : "USD";

  // Clamp category the same way — fall back to "other" if the AI returns
  // something unexpected.
  const aiCategory =
    typeof parsed.category === "string" ? parsed.category : "";
  const category = (CATEGORIES as readonly string[]).includes(aiCategory)
    ? aiCategory
    : "other";

  return NextResponse.json({
    vendor: parsed.vendor ?? null,
    receipt_date: parsed.receipt_date ?? null,
    amount_total: parsed.amount_total ?? null,
    currency,
    category,
    line_items: Array.isArray(parsed.line_items) ? parsed.line_items : [],
    confidence: parsed.confidence ?? "low",
    notes: parsed.notes ?? null,
    ai_extraction: parsed,
  });
}
