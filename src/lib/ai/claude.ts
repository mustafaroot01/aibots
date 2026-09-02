/** مزوّد Claude — Anthropic Messages API مع مخرجات منظمة */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { BatchSchema, buildSystem, buildUserPrompt, type ExtractionItem } from "./schema";
import type { RawPost } from "../types";
import type { Settings } from "../settings";
import { acquire } from "./rate";

let client: Anthropic | null = null;

export function hasKey(): boolean {
  const k = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || "";
  return k.length > 20 && !k.includes("...");
}

export async function run(chunk: RawPost[], cfg: Settings): Promise<ExtractionItem[]> {
  if (!client) client = new Anthropic();
  await acquire(cfg.ai_rpm);

  const res = await client.messages.parse({
    model: cfg.claude_model,
    max_tokens: 8000,
    system: [{ type: "text", text: buildSystem(), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildUserPrompt(chunk) }],
    output_config: { effort: cfg.claude_effort, format: zodOutputFormat(BatchSchema) },
  });

  if (res.stop_reason === "refusal") throw new Error("الموديل رفض الطلب (refusal)");
  if (!res.parsed_output) throw new Error("ما رجعت نتيجة منظمة من Claude");
  return res.parsed_output.items;
}
