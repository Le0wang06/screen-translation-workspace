import OpenAI from "openai";

import type { UiTextBlock } from "@/lib/ui-text-types";

// gpt-4o gives noticeably more natural, context-aware UI translations than
// gpt-4o-mini and reliably returns one entry per id. Quality matters more than
// the small extra latency here.
export const PROCESS_TRANSLATION_MODEL =
  process.env.PROCESS_TRANSLATION_MODEL ?? "gpt-4o";

type TranslationPayloadItem = { id: number; text: string; kind: string };

async function requestTranslations(
  openai: OpenAI,
  payload: TranslationPayloadItem[],
  targetLanguage: string,
  sourceHint: string,
  notesHint: string,
): Promise<{
  title?: string;
  summary?: string;
  source_language?: string;
  byId: Map<number, string>;
}> {
  const response = await openai.chat.completions.create({
    model: PROCESS_TRANSLATION_MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a senior UI localizer. Translate interface strings into " +
          "natural, idiomatic text a native speaker would expect in a real " +
          "product. Preserve meaning, tone, and UI conventions. Keep product " +
          "and brand names (e.g. Dependabot, GitHub) untranslated. Match the " +
          "concise style of the original — button and link labels stay short. " +
          "Never leave a string in the source language and never add notes.",
      },
      {
        role: "user",
        content: `Translate every UI string below into natural ${targetLanguage}.
${sourceHint}${notesHint}

These strings all come from one screen, so keep terminology consistent across them.

Input (JSON): ${JSON.stringify(payload)}

Return JSON only:
{
  "title": "short screen title in ${targetLanguage}",
  "summary": "one English sentence describing the screen",
  "source_language": "iso code",
  "translations": [{ "id": 0, "text": "translated string" }]
}

Rules:
- Exactly one translation per input id; include every id.
- Keep button/link labels short and action-oriented.
- Preserve separators and symbols like "•" that structure a label.`,
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

  const byId = new Map<number, string>();
  for (const item of parsed.translations ?? []) {
    if (typeof item.id === "number" && typeof item.text === "string") {
      byId.set(item.id, item.text.trim());
    }
  }

  return {
    title: parsed.title?.trim(),
    summary: parsed.summary?.trim(),
    source_language: parsed.source_language?.trim(),
    byId,
  };
}

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
  const payload: TranslationPayloadItem[] = blocks.map((block, id) => ({
    id,
    text: block.source_text,
    kind: block.style.kind ?? "body",
  }));

  const sourceHint = sourceLanguage
    ? `Source language: ${sourceLanguage}.`
    : "Detect the source language.";
  const notesHint = notes?.trim() ? `\nReviewer notes: ${notes.trim()}` : "";

  const first = await requestTranslations(
    openai,
    payload,
    targetLanguage,
    sourceHint,
    notesHint,
  );

  const translations = new Map(first.byId);

  // Completeness safeguard: re-translate any id that was dropped or came back
  // unchanged (still in the source language), so nothing stays untranslated.
  const missing = payload.filter((item) => {
    const t = translations.get(item.id);
    return !t || t === item.text;
  });

  if (missing.length > 0) {
    try {
      const retry = await requestTranslations(
        openai,
        missing,
        targetLanguage,
        sourceHint,
        notesHint,
      );
      for (const item of missing) {
        const t = retry.byId.get(item.id);
        if (t && t !== item.text) translations.set(item.id, t);
      }
    } catch {
      // Best effort — fall back to whatever the first pass produced.
    }
  }

  return {
    title: first.title || "Localized screen",
    summary: first.summary || "Localized UI screenshot",
    source_language: first.source_language,
    blocks: blocks.map((block, id) => ({
      ...block,
      translated_text: translations.get(id) || block.source_text,
    })),
  };
}
