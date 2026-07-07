import OpenAI from "openai";

import type { requireUser } from "@/lib/api/helpers";
import { SCREENSHOTS_BUCKET } from "@/lib/storage/screenshots";

type SupabaseClient = Awaited<ReturnType<typeof requireUser>>["supabase"];

export type ProcessStepInput = {
  stepId: string;
  imagePath: string;
  sourceLanguage?: string | null;
  targetLanguage: string;
};

export type TranslationBlock = {
  source_text: string;
  translated_text: string;
};

export type ProcessStepResult = {
  title: string;
  summary: string;
  source_language?: string;
  target_language: string;
  blocks: TranslationBlock[];
};

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  return new OpenAI({ apiKey });
}

function buildPrompt(sourceLanguage: string | null | undefined, targetLanguage: string) {
  const sourceHint = sourceLanguage
    ? `The visible UI text is primarily in ${sourceLanguage}.`
    : "Detect the source language from the screenshot.";

  return `You are a UI translation assistant. Read this product screenshot and extract visible UI text.

${sourceHint}
Translate all meaningful UI strings into ${targetLanguage}.

Return JSON only with this exact shape:
{
  "title": "short screen title",
  "summary": "one sentence describing what the user is doing on this screen",
  "source_language": "iso code",
  "target_language": "${targetLanguage}",
  "blocks": [
    { "source_text": "original visible text", "translated_text": "translation" }
  ]
}

Rules:
- Include buttons, labels, headings, placeholders, and other visible UI copy.
- Skip decorative text, logos, and watermarks.
- Keep translations concise and natural for product UI.
- Return an empty blocks array only if there is truly no readable UI text.`;
}

function parseProcessStepResult(
  raw: string,
  targetLanguage: string,
): ProcessStepResult {
  const parsed = JSON.parse(raw) as Partial<ProcessStepResult>;

  if (!parsed.title || !parsed.summary || !Array.isArray(parsed.blocks)) {
    throw new Error("AI response missing required fields.");
  }

  const blocks = parsed.blocks
    .filter(
      (block): block is TranslationBlock =>
        typeof block?.source_text === "string" &&
        typeof block?.translated_text === "string" &&
        block.source_text.trim().length > 0 &&
        block.translated_text.trim().length > 0,
    )
    .map((block) => ({
      source_text: block.source_text.trim(),
      translated_text: block.translated_text.trim(),
    }));

  return {
    title: parsed.title.trim(),
    summary: parsed.summary.trim(),
    source_language: parsed.source_language?.trim(),
    target_language: parsed.target_language?.trim() || targetLanguage,
    blocks,
  };
}

export async function processStep(
  supabase: SupabaseClient,
  input: ProcessStepInput,
): Promise<ProcessStepResult> {
  const { data: file, error: downloadError } = await supabase.storage
    .from(SCREENSHOTS_BUCKET)
    .download(input.imagePath);

  if (downloadError || !file) {
    throw new Error(downloadError?.message ?? "Failed to download screenshot.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mime = file.type || "image/png";

  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildPrompt(input.sourceLanguage, input.targetLanguage),
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mime};base64,${base64}`,
            },
          },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("AI returned an empty response.");
  }

  const result = parseProcessStepResult(content, input.targetLanguage);

  const { error: stepError } = await supabase
    .from("steps")
    .update({
      title: result.title,
      summary: result.summary,
      source_language: result.source_language ?? input.sourceLanguage ?? null,
      target_language: result.target_language,
      status: "done",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.stepId);

  if (stepError) {
    throw new Error(stepError.message);
  }

  if (result.blocks.length > 0) {
    const { error: blocksError } = await supabase.from("step_blocks").insert(
      result.blocks.map((block, index) => ({
        step_id: input.stepId,
        source_text: block.source_text,
        translated_text: block.translated_text,
        position: index,
      })),
    );

    if (blocksError) {
      throw new Error(blocksError.message);
    }
  }

  return result;
}

export async function markStepFailed(
  supabase: SupabaseClient,
  stepId: string,
  message: string,
) {
  await supabase
    .from("steps")
    .update({
      status: "failed",
      error_message: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", stepId);
}
