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
const IMAGE_MODEL = Deno.env.get("PROCESS_IMAGE_MODEL") ?? "gpt-image-1-mini";
const IMAGE_QUALITY = Deno.env.get("PROCESS_IMAGE_QUALITY") ?? "low";

function buildLocalizationPrompt(
  sourceLanguage: string | null | undefined,
  targetLanguage: string,
  notes?: string | null,
) {
  const sourceHint = sourceLanguage
    ? `Source UI language: ${sourceLanguage}.`
    : "Detect the source language from the screenshot.";

  const notesHint = notes?.trim() ? `\nReviewer notes: ${notes.trim()}` : "";

  return `Edit this UI screenshot in place.
${sourceHint}
Translate all visible UI text into natural ${targetLanguage}.
${notesHint}
Keep layout, colors, icons, and spacing the same. Only change readable UI copy.`;
}

function buildMetadataPrompt(targetLanguage: string) {
  return `Return JSON only:
{"title":"short screen title in ${targetLanguage}","summary":"one English sentence about what the user is doing","source_language":"iso code"}`;
}

function localizedPath(imagePath: string, stepId: string) {
  const parts = imagePath.split("/");
  const projectId = parts[0];
  const flowId = parts[1];
  return `${projectId}/${flowId}/${stepId}-localized.jpg`;
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
  const mime = file.type || "image/png";
  const imageDataUrl = `data:${mime};base64,${base64}`;

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
            { type: "input_image", image_url: imageDataUrl, detail: "low" },
          ],
        },
      ],
      tools: [
        {
          type: "image_generation",
          action: "edit",
          model: IMAGE_MODEL,
          quality: IMAGE_QUALITY,
          output_format: "jpeg",
          output_compression: 75,
          moderation: "low",
          input_fidelity: "low",
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

  const translatedImagePath = localizedPath(payload.imagePath, payload.stepId);
  const binary = Uint8Array.from(atob(imageBase64), (char) => char.charCodeAt(0));

  const { error: uploadError } = await supabase.storage
    .from("screenshots")
    .upload(translatedImagePath, binary, {
      contentType: "image/jpeg",
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
