import { NextResponse } from "next/server";

import { getOwnedStep } from "@/lib/api/flows";
import {
  badRequest,
  notFound,
  requireUser,
  serverError,
} from "@/lib/api/helpers";
import {
  annotatedScreenshotStoragePath,
  SCREENSHOTS_BUCKET,
} from "@/lib/storage/screenshots";
import { getScreenshotSignedUrl } from "@/lib/storage/signed-url";
import type { Json } from "@/lib/database.types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id: stepId } = await context.params;
  const { user, supabase, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const { step, error: stepError } = await getOwnedStep(
    supabase,
    stepId,
    user.id,
  );

  if (stepError) {
    return serverError(stepError.message);
  }

  if (!step) {
    return notFound("屏幕不存在。");
  }

  const annotatedImageUrl = step.annotated_image_url
    ? await getScreenshotSignedUrl(supabase, step.annotated_image_url)
    : null;

  return NextResponse.json({
    annotationDocument: step.annotation_document ?? null,
    annotatedImageUrl,
    annotatedImagePath: step.annotated_image_url ?? null,
  });
}

export async function PUT(request: Request, context: RouteContext) {
  const { id: stepId } = await context.params;
  const { user, supabase, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const { step, error: stepError } = await getOwnedStep(
    supabase,
    stepId,
    user.id,
  );

  if (stepError) {
    return serverError(stepError.message);
  }

  if (!step) {
    return notFound("屏幕不存在。");
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const documentRaw = formData.get("document");
    const image = formData.get("image");

    if (typeof documentRaw !== "string") {
      return badRequest("缺少批注文档。");
    }

    let annotationDocument: Json;
    try {
      annotationDocument = JSON.parse(documentRaw) as Json;
    } catch {
      return badRequest("批注文档格式无效。");
    }

    if (!(image instanceof File)) {
      return badRequest("缺少批注图片。");
    }

    const path = annotatedScreenshotStoragePath(
      step.project_id,
      step.flow_id,
      step.id,
      "png",
    );

    const bytes = Buffer.from(await image.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(SCREENSHOTS_BUCKET)
      .upload(path, bytes, {
        contentType: image.type || "image/png",
        upsert: true,
      });

    if (uploadError) {
      return serverError(uploadError.message);
    }

    const { data: updatedStep, error: updateError } = await supabase
      .from("steps")
      .update({
        annotation_document: annotationDocument,
        annotated_image_url: path,
        updated_at: new Date().toISOString(),
      })
      .eq("id", stepId)
      .select("id, annotation_document, annotated_image_url, updated_at")
      .single();

    if (updateError || !updatedStep) {
      return serverError(updateError?.message ?? "保存批注失败。");
    }

    const annotatedImageUrl = await getScreenshotSignedUrl(supabase, path);

    return NextResponse.json({
      step: updatedStep,
      annotatedImageUrl,
    });
  }

  const body = (await request.json()) as {
    annotationDocument?: Json;
    clear?: boolean;
  };

  if (body.clear) {
    if (step.annotated_image_url) {
      await supabase.storage
        .from(SCREENSHOTS_BUCKET)
        .remove([step.annotated_image_url]);
    }

    const { data: updatedStep, error: updateError } = await supabase
      .from("steps")
      .update({
        annotation_document: null,
        annotated_image_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", stepId)
      .select("id, annotation_document, annotated_image_url, updated_at")
      .single();

    if (updateError || !updatedStep) {
      return serverError(updateError?.message ?? "清除批注失败。");
    }

    return NextResponse.json({ step: updatedStep, annotatedImageUrl: null });
  }

  if (body.annotationDocument === undefined) {
    return badRequest("请提供批注文档。");
  }

  const { data: updatedStep, error: updateError } = await supabase
    .from("steps")
    .update({
      annotation_document: body.annotationDocument,
      updated_at: new Date().toISOString(),
    })
    .eq("id", stepId)
    .select("id, annotation_document, annotated_image_url, updated_at")
    .single();

  if (updateError || !updatedStep) {
    return serverError(updateError?.message ?? "保存批注失败。");
  }

  return NextResponse.json({ step: updatedStep });
}
