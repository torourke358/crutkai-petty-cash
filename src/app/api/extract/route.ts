import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { EXTRACTION_PROMPT } from "@/lib/extraction-prompt";

const MODEL = "claude-sonnet-4-6";

// Strip ```json fences if the model adds them despite instructions.
function stripFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

type ImageBlock = Anthropic.ImageBlockParam;

async function callClaude(imageSource: ImageBlock["source"]) {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY?.trim(),
  });
  return anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: imageSource },
          { type: "text", text: EXTRACTION_PROMPT },
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

  let imageUrl: string;
  try {
    ({ imageUrl } = await request.json());
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!imageUrl) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  let message;
  try {
    // Prefer passing the URL directly.
    message = await callClaude({ type: "url", url: imageUrl });
  } catch {
    // Fall back to fetching + base64 (e.g. signed URL Anthropic can't reach).
    try {
      const res = await fetch(imageUrl);
      const buf = Buffer.from(await res.arrayBuffer());
      const mediaType = (res.headers.get("content-type") ??
        "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif";
      message = await callClaude({
        type: "base64",
        media_type: mediaType,
        data: buf.toString("base64"),
      });
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

  return NextResponse.json({
    vendor: parsed.vendor ?? null,
    receipt_date: parsed.receipt_date ?? null,
    amount_total: parsed.amount_total ?? null,
    currency: parsed.currency ?? "USD",
    line_items: Array.isArray(parsed.line_items) ? parsed.line_items : [],
    confidence: parsed.confidence ?? "low",
    notes: parsed.notes ?? null,
    ai_extraction: parsed,
  });
}
