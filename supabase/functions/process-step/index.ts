import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

type ProcessStepPayload = {
  stepId: string;
  imagePath: string;
  sourceLanguage?: string | null;
  targetLanguage: string;
  notes?: string | null;
};

type OpenAiImageSize = "1024x1024" | "1536x1024" | "1024x1536";

type LetterboxPlan = {
  size: OpenAiImageSize;
  canvasWidth: number;
  canvasHeight: number;
  crop: { left: number; top: number; width: number; height: number };
};

const RESPONSE_MODEL = Deno.env.get("PROCESS_STEP_RESPONSE_MODEL") ?? "gpt-4o-mini";
const IMAGE_MODEL = Deno.env.get("PROCESS_IMAGE_MODEL") ?? "gpt-image-1";
const IMAGE_QUALITY = Deno.env.get("PROCESS_IMAGE_QUALITY") ?? "medium";
const IMAGE_FORMAT_OVERRIDE = Deno.env.get("PROCESS_IMAGE_OUTPUT_FORMAT");
const IMAGE_COMPRESSION = Number(Deno.env.get("PROCESS_IMAGE_OUTPUT_COMPRESSION") ?? "88");
const IMAGE_INPUT_FIDELITY =
  (Deno.env.get("PROCESS_IMAGE_INPUT_FIDELITY") as "low" | "high" | undefined) ??
  "low";
const IMAGE_INPUT_DETAIL =
  (Deno.env.get("PROCESS_IMAGE_INPUT_DETAIL") as "low" | "high" | "auto" | undefined) ??
  "auto";

type OutputFormat = "png" | "jpeg" | "webp";

const OPENAI_CANVAS_SIZES: Record<OpenAiImageSize, { width: number; height: number }> = {
  "1024x1024": { width: 1024, height: 1024 },
  "1536x1024": { width: 1536, height: 1024 },
  "1024x1536": { width: 1024, height: 1536 },
};

function pickOpenAiImageSize(width: number, height: number): OpenAiImageSize {
  const ratio = width / height;
  if (ratio > 1.2) return "1536x1024";
  if (ratio < 0.83) return "1024x1536";
  return "1024x1024";
}

function computeLetterboxPlan(width: number, height: number): LetterboxPlan {
  const size = pickOpenAiImageSize(width, height);
  const { width: canvasWidth, height: canvasHeight } = OPENAI_CANVAS_SIZES[size];
  const scale = Math.min(canvasWidth / width, canvasHeight / height);
  const scaledWidth = Math.max(1, Math.round(width * scale));
  const scaledHeight = Math.max(1, Math.round(height * scale));
  const left = Math.round((canvasWidth - scaledWidth) / 2);
  const top = Math.round((canvasHeight - scaledHeight) / 2);

  return {
    size,
    canvasWidth,
    canvasHeight,
    crop: { left, top, width: scaledWidth, height: scaledHeight },
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function prepareScreenshot(bytes: Uint8Array) {
  const image = await Image.decode(bytes);
  const maxDimension = 2048;
  const longestEdge = Math.max(image.width, image.height);
  const scale = longestEdge > maxDimension ? maxDimension / longestEdge : 1;
  const resized = image.resize(
    Math.max(1, Math.round(image.width * scale)),
    Math.max(1, Math.round(image.height * scale)),
  );
  const letterbox = computeLetterboxPlan(resized.width, resized.height);
  const canvas = new Image(letterbox.canvasWidth, letterbox.canvasHeight);
  canvas.fill(resized.getPixelAt(0, 0));
  canvas.composite(resized, letterbox.crop.left, letterbox.crop.top);

  return {
    bytes: await canvas.encode(),
    letterbox,
  };
}

async function cropTranslatedScreenshot(bytes: Uint8Array, letterbox: LetterboxPlan) {
  const image = await Image.decode(bytes);
  const scaleX = image.width / letterbox.canvasWidth;
  const scaleY = image.height / letterbox.canvasHeight;
  const left = Math.round(letterbox.crop.left * scaleX);
  const top = Math.round(letterbox.crop.top * scaleY);
  const width = Math.min(
    image.width - left,
    Math.round(letterbox.crop.width * scaleX),
  );
  const height = Math.min(
    image.height - top,
    Math.round(letterbox.crop.height * scaleY),
  );

  return await image.crop(left, top, width, height).encode();
}

function extensionFromPath(path: string) {
  const match = path.match(/\.([^.]+)$/i);
  return match?.[1]?.toLowerCase() ?? "png";
}

function mimeFromExtension(extension: string) {
  switch (extension.replace(/^\./, "").toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

function openAiFormatFromMime(mime: string): OutputFormat {
  switch (mime) {
    case "image/jpeg":
      return "jpeg";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

function resolveSourceImageFormat(imagePath: string, fileType?: string | null) {
  const pathExtension = extensionFromPath(imagePath);
  const mime = fileType?.startsWith("image/") ? fileType : mimeFromExtension(pathExtension);
  const openAiFormat = openAiFormatFromMime(mime);
  const outputFormat = (IMAGE_FORMAT_OVERRIDE as OutputFormat | undefined) ?? openAiFormat;
  const storageExtension =
    outputFormat === "jpeg" ? "jpg" : outputFormat === "webp" ? "webp" : "png";

  return { mime, outputFormat, storageExtension };
}

function contentTypeForFormat(format: OutputFormat) {
  if (format === "jpeg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
}

function buildLocalizationPrompt(
  sourceLanguage: string | null | undefined,
  targetLanguage: string,
  notes?: string | null,
) {
  const sourceHint = sourceLanguage
    ? `Source UI language: ${sourceLanguage}.`
    : "Detect the source language from the screenshot.";

  const notesHint = notes?.trim() ? `\nReviewer notes: ${notes.trim()}` : "";

  return `Edit this UI screenshot in place. Do not redesign or crop the frame.
${sourceHint}
Translate all visible UI text into natural ${targetLanguage}.
${notesHint}
Keep the full screenshot visible: same layout, colors, backgrounds, icons, spacing, and typography. Only replace readable UI copy.`;
}

function buildMetadataPrompt(targetLanguage: string) {
  return `Return JSON only:
{"title":"short screen title in ${targetLanguage}","summary":"one English sentence about what the user is doing","source_language":"iso code"}`;
}

function localizedPath(imagePath: string, stepId: string, storageExtension: string) {
  const parts = imagePath.split("/");
  const projectId = parts[0];
  const flowId = parts[1];
  return `${projectId}/${flowId}/${stepId}-localized.${storageExtension}`;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!openaiKey || !supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Server is missing required secrets." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const payload = (await request.json()) as ProcessStepPayload;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: file, error: downloadError } = await supabase.storage
    .from("screenshots")
    .download(payload.imagePath);

  if (downloadError || !file) {
    await supabase
      .from("steps")
      .update({
        status: "failed",
        error_message: downloadError?.message ?? "Failed to download screenshot.",
      })
      .eq("id", payload.stepId);

    return new Response(JSON.stringify({ error: "Download failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const arrayBuffer = await file.arrayBuffer();
  const sourceBytes = new Uint8Array(arrayBuffer);
  const sourceFormat = resolveSourceImageFormat(payload.imagePath, file.type);
  const prepared = await prepareScreenshot(sourceBytes);
  const imageDataUrl = `data:image/png;base64,${bytesToBase64(prepared.bytes)}`;

  const imageResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: RESPONSE_MODEL,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildLocalizationPrompt(
                payload.sourceLanguage,
                payload.targetLanguage,
                payload.notes,
              ),
            },
            { type: "input_image", image_url: imageDataUrl, detail: IMAGE_INPUT_DETAIL },
          ],
        },
      ],
      tools: [
        {
          type: "image_generation",
          action: "edit",
          model: IMAGE_MODEL,
          quality: IMAGE_QUALITY,
          size: prepared.letterbox.size,
          output_format: sourceFormat.outputFormat,
          ...(sourceFormat.outputFormat === "jpeg" || sourceFormat.outputFormat === "webp"
            ? { output_compression: IMAGE_COMPRESSION }
            : {}),
          moderation: "low",
          input_fidelity: IMAGE_INPUT_FIDELITY,
        },
      ],
      tool_choice: { type: "image_generation" },
    }),
  });

  if (!imageResponse.ok) {
    const message = await imageResponse.text();
    await supabase
      .from("steps")
      .update({ status: "failed", error_message: message })
      .eq("id", payload.stepId);

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const imageJson = await imageResponse.json();
  const imageBase64 = imageJson.output?.find(
    (item: { type?: string; result?: string }) =>
      item.type === "image_generation_call" && item.result,
  )?.result as string | undefined;

  if (!imageBase64) {
    await supabase
      .from("steps")
      .update({
        status: "failed",
        error_message: "AI did not return a localized screenshot.",
      })
      .eq("id", payload.stepId);

    return new Response(JSON.stringify({ error: "No image generated" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const translatedImagePath = localizedPath(
    payload.imagePath,
    payload.stepId,
    sourceFormat.storageExtension,
  );
  const generatedBytes = Uint8Array.from(atob(imageBase64), (char) => char.charCodeAt(0));
  const binary = await cropTranslatedScreenshot(generatedBytes, prepared.letterbox);

  const { error: uploadError } = await supabase.storage
    .from("screenshots")
    .upload(translatedImagePath, binary, {
      contentType: contentTypeForFormat(sourceFormat.outputFormat),
      upsert: true,
    });

  if (uploadError) {
    await supabase
      .from("steps")
      .update({ status: "failed", error_message: uploadError.message })
      .eq("id", payload.stepId);

    return new Response(JSON.stringify({ error: uploadError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error: interimUpdateError } = await supabase
    .from("steps")
    .update({
      title: "Localized screen",
      summary: "Localized UI screenshot",
      source_language: payload.sourceLanguage ?? null,
      target_language: payload.targetLanguage,
      translated_image_url: translatedImagePath,
      status: "done",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payload.stepId);

  if (interimUpdateError) {
    return new Response(JSON.stringify({ error: interimUpdateError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const metadataResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: buildMetadataPrompt(payload.targetLanguage) },
              {
                type: "image_url",
                image_url: { url: imageDataUrl, detail: "low" },
              },
            ],
          },
        ],
      }),
    });

    if (metadataResponse.ok) {
      const metadataJson = await metadataResponse.json();
      const content = metadataJson.choices?.[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        await supabase
          .from("steps")
          .update({
            title: parsed.title?.trim() || "Localized screen",
            summary: parsed.summary?.trim() || "Localized UI screenshot",
            source_language:
              parsed.source_language?.trim() || payload.sourceLanguage || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", payload.stepId);
      }
    }
  } catch {
    // Image is already saved; metadata can stay as placeholder.
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
