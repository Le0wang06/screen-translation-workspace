import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type ProcessStepPayload = {
  stepId: string;
  imagePath: string;
  sourceLanguage?: string | null;
  targetLanguage: string;
  notes?: string | null;
};

const RESPONSE_MODEL = Deno.env.get("PROCESS_STEP_RESPONSE_MODEL") ?? "gpt-4o-mini";
const IMAGE_MODEL = Deno.env.get("PROCESS_IMAGE_MODEL") ?? "gpt-image-1";
const IMAGE_QUALITY = Deno.env.get("PROCESS_IMAGE_QUALITY") ?? "medium";
const IMAGE_FORMAT_OVERRIDE = Deno.env.get("PROCESS_IMAGE_OUTPUT_FORMAT");
const IMAGE_COMPRESSION = Number(Deno.env.get("PROCESS_IMAGE_OUTPUT_COMPRESSION") ?? "88");
const IMAGE_INPUT_FIDELITY =
  (Deno.env.get("PROCESS_IMAGE_INPUT_FIDELITY") as "low" | "high" | undefined) ??
  "high";

type OutputFormat = "png" | "jpeg" | "webp";

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

  return `Localize this existing product screenshot with a strict in-place edit. Do not redesign the screen.

${sourceHint}
Replace ONLY visible UI text with natural ${targetLanguage} translations.
${notesHint}
Rules:
- Keep the exact same screenshot: layout, colors, backgrounds, icons, images, spacing, alignment, and typography.
- Do not move, resize, add, or remove UI elements.
- Do not change logos unless they contain translatable words.
- Do not add borders, watermarks, blur, or visual effects.
- The result must look like the original image with translated labels only.`;
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
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  const sourceFormat = resolveSourceImageFormat(payload.imagePath, file.type);
  const imageDataUrl = `data:${sourceFormat.mime};base64,${base64}`;

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
            { type: "input_image", image_url: imageDataUrl, detail: "high" },
          ],
        },
      ],
      tools: [
        {
          type: "image_generation",
          action: "edit",
          model: IMAGE_MODEL,
          quality: IMAGE_QUALITY,
          output_format: sourceFormat.outputFormat,
          ...(sourceFormat.outputFormat === "jpeg" || sourceFormat.outputFormat === "webp"
            ? { output_compression: IMAGE_COMPRESSION }
            : {}),
          moderation: "low",
          input_fidelity: IMAGE_INPUT_FIDELITY,
          size: "auto",
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
  const binary = Uint8Array.from(atob(imageBase64), (char) => char.charCodeAt(0));

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
