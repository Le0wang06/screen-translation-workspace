import OpenAI from "openai";

import type { UiTextBlock } from "@/lib/ui-text-types";

export const PROCESS_TRANSLATION_MODEL =
  process.env.PROCESS_TRANSLATION_MODEL ?? "gpt-4o";

function normalizeKey(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export type TranslatedStrings = {
  title: string;
  summary: string;
  source_language?: string;
  byKey: Map<string, string>;
};

/**
 * Translate a flat list of source strings and return a lookup keyed by the
 * normalized source text, plus a screen title/summary. One text-only call.
 */
export async function translateStrings(
  openai: OpenAI,
  strings: string[],
  targetLanguage: string,
  sourceLanguage?: string | null,
  notes?: string | null,
): Promise<TranslatedStrings> {
  const byKey = new Map<string, string>();
  if (strings.length === 0) {
    return { title: "", summary: "", source_language: undefined, byKey };
  }

  const sourceHint = sourceLanguage
    ? `Source language: ${sourceLanguage}.`
    : "Detect source language.";
  const notesHint = notes?.trim() ? `\nReviewer notes: ${notes.trim()}` : "";

  const payload = strings.map((text, id) => ({ id, text }));

  const response = await openai.chat.completions.create({
    model: PROCESS_TRANSLATION_MODEL,
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      {
        role: "user",
        content: `Translate these UI strings to natural ${targetLanguage}.
${sourceHint}${notesHint}

Input:
${JSON.stringify(payload)}

Return JSON only:
{
  "title": "short screen title in ${targetLanguage}",
  "summary": "one English sentence describing the screen",
  "source_language": "iso",
  "translations": [{ "id": 0, "text": "..." }]
}

Keep button/link labels short and natural. Return a translation for every id.`,
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

  for (const item of parsed.translations ?? []) {
    const source = strings[item.id];
    const translated = item.text?.trim();
    if (source && translated) byKey.set(normalizeKey(source), translated);
  }

  return {
    title: parsed.title?.trim() || "",
    summary: parsed.summary?.trim() || "",
    source_language: parsed.source_language?.trim() || undefined,
    byKey,
  };
}

/**
 * Fallback translation pass. The primary localize call already returns a
 * translation for every block, so this only fills in blocks that came back
 * untranslated (translated_text still equal to source_text). When everything
 * is already translated it makes zero API calls.
 */
export async function translateMissingBlocks(
  openai: OpenAI,
  blocks: UiTextBlock[],
  targetLanguage: string,
  sourceLanguage?: string | null,
  notes?: string | null,
): Promise<UiTextBlock[]> {
  const missing = blocks
    .map((block, id) => ({ block, id }))
    .filter(({ block }) => !block.translated_text?.trim() ||
      block.translated_text.trim() === block.source_text.trim());

  if (missing.length === 0) return blocks;

  const sourceHint = sourceLanguage
    ? `Source language: ${sourceLanguage}.`
    : "Detect source language.";
  const notesHint = notes?.trim() ? `\nReviewer notes: ${notes.trim()}` : "";

  const payload = missing.map(({ block, id }) => ({
    id,
    text: block.source_text,
    kind: block.style.kind ?? "body",
  }));

  const response = await openai.chat.completions.create({
    model: PROCESS_TRANSLATION_MODEL,
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      {
        role: "user",
        content: `Translate UI text to natural ${targetLanguage}.
${sourceHint}${notesHint}

Input:
${JSON.stringify(payload)}

Return JSON only:
{ "translations": [{ "id": 0, "text": "..." }] }

Keep button/link labels short and natural. Return a translation for every id.`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return blocks;

  const parsed = JSON.parse(content) as {
    translations?: { id: number; text: string }[];
  };
  const byId = new Map(
    (parsed.translations ?? []).map((item) => [item.id, item.text?.trim() ?? ""]),
  );

  return blocks.map((block, id) => {
    const next = byId.get(id);
    if (next) return { ...block, translated_text: next };
    return block;
  });
}
