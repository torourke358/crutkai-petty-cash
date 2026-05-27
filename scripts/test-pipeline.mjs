// Mirrors /api/extract: try url image source, fall back to base64.
import Anthropic from "@anthropic-ai/sdk";

const url = process.argv[2];
const PROMPT = "Read this receipt and return ONLY JSON: {\"vendor\":..., \"amount_total\":..., \"receipt_date\":\"YYYY-MM-DD\", \"confidence\":\"high|medium|low\"}";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function call(source) {
  const m = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content: [{ type: "image", source }, { type: "text", text: PROMPT }] }],
  });
  return m.content.find((b) => b.type === "text")?.text ?? "";
}

try {
  const out = await call({ type: "url", url });
  console.log("PATH: url source ✓");
  console.log(out);
} catch (e) {
  console.log("url source FAILED:", e.status, e.message);
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const out = await call({ type: "base64", media_type: "image/jpeg", data: buf.toString("base64") });
  console.log("PATH: base64 fallback ✓");
  console.log(out);
}
