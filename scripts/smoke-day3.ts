/**
 * Day 3 smoke test (image-regeneration pivot).
 * Run: npx tsx scripts/smoke-day3.ts
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

import type { Database } from "../lib/database.types";
import { processStep } from "../lib/process-step";
import {
  SCREENSHOTS_BUCKET,
  screenshotStoragePath,
} from "../lib/storage/screenshots";

const FIXTURES = [
  { label: "Login", text: "Sign+In" },
  { label: "Cart", text: "Shopping+Cart" },
  { label: "Payment", text: "Pay+Now" },
] as const;

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in environment.`);
  }
  return value;
}

function log(step: string, detail?: string) {
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`[smoke] ${step}${suffix}`);
}

async function fetchFixturePng(text: string) {
  const response = await fetch(
    `https://placehold.co/640x400/e2e8f0/1e293b/png?text=${text}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to download fixture image (${response.status}).`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  requireEnv("OPENAI_API_KEY");

  log("Checking OpenAI key");
  const openai = new OpenAI();
  await openai.models.list();
  log("OpenAI key OK");

  const supabase = createClient<Database>(supabaseUrl, anonKey);
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY;
  const smokeEmail = process.env.SMOKE_TEST_EMAIL;
  const smokePassword = process.env.SMOKE_TEST_PASSWORD;

  let userId: string;

  if (smokeEmail && smokePassword) {
    log("Signing in with SMOKE_TEST_EMAIL");
    const { data, error } = await supabase.auth.signInWithPassword({
      email: smokeEmail,
      password: smokePassword,
    });
    if (error || !data.user) {
      throw new Error(error?.message ?? "Smoke-test sign-in failed.");
    }
    userId = data.user.id;
  } else if (serviceRoleKey) {
    const email = `smoke.${Date.now()}@gmail.com`;
    const password = `SmokeTest!${randomUUID().slice(0, 8)}`;
    log("Creating confirmed smoke-test user via service role");
    const admin = createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError) {
      throw new Error(createError.message);
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.user) {
      throw new Error(error?.message ?? "Smoke-test sign-in failed.");
    }
    userId = data.user.id;
    log("Authenticated", email);
  } else {
    log("Trying anonymous auth");
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      throw new Error(
        "Could not authenticate for smoke test. Set SMOKE_TEST_EMAIL + SMOKE_TEST_PASSWORD, or SUPABASE_SERVICE_ROLE_KEY in .env.local.",
      );
    }
    userId = data.user.id;
    log("Authenticated anonymously", userId);
  }

  if (!userId!) {
    throw new Error("No authenticated user for smoke test.");
  }

  log("Creating project + flow");
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      name: "Smoke Test Project",
      owner_id: userId,
      source_language: "en",
      target_language: "es",
    })
    .select("*")
    .single();

  if (projectError || !project) {
    throw new Error(projectError?.message ?? "Failed to create project.");
  }

  const { data: flow, error: flowError } = await supabase
    .from("flows")
    .insert({
      name: "Supplier App Checkout",
      project_id: project.id,
      position: 0,
    })
    .select("*")
    .single();

  if (flowError || !flow) {
    throw new Error(flowError?.message ?? "Failed to create flow.");
  }

  const stepIds: string[] = [];

  for (let index = 0; index < FIXTURES.length; index += 1) {
    const fixture = FIXTURES[index];
    log(`Uploading screen ${index + 1}`, fixture.label);

    const { data: step, error: stepError } = await supabase
      .from("steps")
      .insert({
        flow_id: flow.id,
        project_id: project.id,
        status: "processing",
        image_url: "",
        position: index,
        source_language: "en",
        target_language: "es",
      })
      .select("*")
      .single();

    if (stepError || !step) {
      throw new Error(stepError?.message ?? "Failed to create step.");
    }

    const imagePath = screenshotStoragePath(
      project.id,
      flow.id,
      step.id,
      "png",
    );
    const png = await fetchFixturePng(fixture.text);

    const { error: uploadError } = await supabase.storage
      .from(SCREENSHOTS_BUCKET)
      .upload(imagePath, png, { contentType: "image/png", upsert: false });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { error: imageUpdateError } = await supabase
      .from("steps")
      .update({ image_url: imagePath })
      .eq("id", step.id);

    if (imageUpdateError) {
      throw new Error(imageUpdateError.message);
    }

    log(`Processing screen ${index + 1} with OpenAI`);
    await processStep(supabase, {
      stepId: step.id,
      imagePath,
      sourceLanguage: "en",
      targetLanguage: "es",
    });

    const { data: done, error: doneError } = await supabase
      .from("steps")
      .select("status, translated_image_url, title, error_message")
      .eq("id", step.id)
      .single();

    if (doneError || done?.status !== "done" || !done.translated_image_url) {
      throw new Error(done?.error_message ?? "Step did not finish successfully.");
    }

    log(`Screen ${index + 1} ready`, done.title ?? fixture.label);
    stepIds.push(step.id);
  }

  const paymentStepId = stepIds[2];

  log("Editing title + summary");
  const { error: patchError } = await supabase
    .from("steps")
    .update({
      title: "Pago confirmado",
      summary: "User reviews total and confirms payment.",
    })
    .eq("id", paymentStepId);

  if (patchError) {
    throw new Error(patchError.message);
  }

  const { data: patched, error: readPatchError } = await supabase
    .from("steps")
    .select("title, summary")
    .eq("id", paymentStepId)
    .single();

  if (readPatchError || patched?.title !== "Pago confirmado") {
    throw new Error("Title edit did not persist.");
  }

  log("Adding comment on payment step");
  const { error: commentError } = await supabase.from("comments").insert({
    step_id: paymentStepId,
    author_id: userId,
    body: 'Should this say "Checkout" not "Cart"?',
  });

  if (commentError) {
    throw new Error(commentError.message);
  }

  const { count, error: countError } = await supabase
    .from("comments")
    .select("*", { count: "exact", head: true })
    .eq("step_id", paymentStepId);

  if (countError || !count) {
    throw new Error("Comment was not saved.");
  }

  const { data: orderedSteps, error: orderError } = await supabase
    .from("steps")
    .select("id, position, status, translated_image_url")
    .eq("flow_id", flow.id)
    .order("position", { ascending: true });

  if (orderError || orderedSteps?.length !== 3) {
    throw new Error("Expected 3 ordered steps in the flow.");
  }

  if (orderedSteps.some((step) => step.status !== "done" || !step.translated_image_url)) {
    throw new Error("Not all steps finished with translated images.");
  }

  console.log("\n✅ Day 3 smoke test passed");
  console.log(`   Project: ${project.id}`);
  console.log(`   Flow:    ${flow.id}`);
  console.log(`   Steps:   ${stepIds.join(", ")}`);
  console.log(`   User:    ${userId}`);
}

main().catch((error) => {
  console.error("\n❌ Day 3 smoke test failed");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
