import OpenAI from "openai";

import type { UiTextBlock } from "@/lib/ui-text-types";

export const PROCESS_TRANSLATION_MODEL =
  process.env.PROCESS_TRANSLATION_MODEL ?? "gpt-4o-mini";

export async function translateLocatedBlocks(
  openai: OpenAI,
  blocks: UiTextBlock[],
  targetLanguage: string,
  sourceLanguage?: string | null,
  notes?: string | null,
): Promise<{
  title: string;
  summary: string;
  source_language?: string;
  blocks: UiTextBlock[];
}> {
  const payload = blocks.map((block, id) => ({
    id,
    text: block.source_text,
    kind: block.style.kind ?? "body",
  }));

  const sourceHint = sourceLanguage
    ? `Source language: ${sourceLanguage}.`
    : "Detect source language.";

  const notesHint = notes?.trim() ? `\nReviewer notes: ${notes.trim()}` : "";

  const response = await openai.chat.completions.create({
    model: PROCESS_TRANSLATION_MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: `Translate UI text to natural ${targetLanguage}.
${sourceHint}${notesHint}

Input:
${JSON.stringify(payload)}

Return JSON only:
{
  "title": "short screen title in ${targetLanguage}",
  "summary": "one English sentence",
  "source_language": "iso",
  "translations": [{ "id": 0, "text": "..." }]
}

Keep button/link labels short. One translation per id.`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Translation model returned empty response.");

  const parsed = JSON.parse(content) as {
    title?: string;
    summary?: string;
    source_language?: string;
    translations?: { id: number; text: string }[];
  };

  const byId = new Map(
    (parsed.translations ?? []).map((item) => [item.id, item.text.trim()]),
  );

  return {
    title: parsed.title?.trim() || "Localized screen",
    summary: parsed.summary?.trim() || "Localized UI screenshot",
    source_language: parsed.source_language?.trim(),
    blocks: blocks.map((block, id) => ({
      ...block,
      translated_text: byId.get(id) || block.source_text,
    })),
  };
}
