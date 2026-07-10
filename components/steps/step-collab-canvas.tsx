"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AssetRecordType,
  DefaultSpinner,
  Editor,
  Tldraw,
  createShapeId,
  getSnapshot,
  loadSnapshot,
  type TLAssetId,
  type TLStoreSnapshot,
} from "tldraw";
import "tldraw/tldraw.css";
import { Eraser, Pencil, Save } from "lucide-react";

import { exportAnnotatedPng } from "@/components/steps/export-annotated";
import { Button } from "@/components/ui/button";

type StepCollabCanvasProps = {
  stepId: string;
  imageUrl: string;
  initialDocument?: TLStoreSnapshot | null;
  onAnnotatedImageChange?: (url: string | null) => void;
  onEditorReady?: (editor: Editor | null) => void;
};

async function measureImage(url: string) {
  return await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      });
    };
    image.onerror = () => reject(new Error("无法加载译图。"));
    image.src = url;
  });
}

function seedTranslatedImage(
  editor: Editor,
  imageUrl: string,
  width: number,
  height: number,
) {
  const assetId = AssetRecordType.createId();
  const shapeId = createShapeId();

  editor.createAssets([
    {
      id: assetId,
      type: "image",
      typeName: "asset",
      props: {
        name: "translated-screenshot",
        src: imageUrl,
        w: width,
        h: height,
        mimeType: "image/png",
        isAnimated: false,
      },
      meta: {
        role: "translated-background",
      },
    },
  ]);

  editor.createShape({
    id: shapeId,
    type: "image",
    x: 0,
    y: 0,
    isLocked: true,
    props: {
      assetId,
      w: width,
      h: height,
    },
    meta: {
      role: "translated-background",
    },
  });

  editor.zoomToFit({ animation: { duration: 0 } });
  editor.setCurrentTool("draw");
}

function refreshBackgroundImageSrc(editor: Editor, imageUrl: string) {
  const assets = editor.getAssets();
  const backgroundAssets = assets.filter(
    (asset) =>
      asset.type === "image" && asset.meta?.role === "translated-background",
  );

  if (backgroundAssets.length === 0) {
    const imageShapes = editor
      .getCurrentPageShapes()
      .filter((shape) => shape.type === "image");

    for (const shape of imageShapes) {
      const assetId = (shape.props as { assetId?: TLAssetId }).assetId;
      if (!assetId) continue;
      const asset = editor.getAsset(assetId);
      if (!asset || asset.type !== "image") continue;
      editor.updateAssets([
        {
          ...asset,
          props: {
            ...asset.props,
            src: imageUrl,
          },
        },
      ]);
    }
    return;
  }

  editor.updateAssets(
    backgroundAssets.map((asset) => ({
      ...asset,
      props: {
        ...asset.props,
        src: imageUrl,
      },
    })),
  );
}

export function StepCollabCanvas({
  stepId,
  imageUrl,
  initialDocument = null,
  onAnnotatedImageChange,
  onEditorReady,
}: StepCollabCanvasProps) {
  const editorRef = useRef<Editor | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seededRef = useRef(false);

  useEffect(() => {
    return () => {
      onEditorReady?.(null);
    };
  }, [onEditorReady]);

  const persist = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;

    setSaving(true);
    setError(null);
    setStatus("正在保存批注…");

    try {
      const snapshot = getSnapshot(editor.store);
      const blob = await exportAnnotatedPng(editor);
      const formData = new FormData();
      formData.set("document", JSON.stringify(snapshot.document));
      formData.set(
        "image",
        new File([blob], "annotated.png", { type: "image/png" }),
      );

      const response = await fetch(`/api/steps/${stepId}/annotations`, {
        method: "PUT",
        body: formData,
      });
      const payload = (await response.json()) as {
        error?: string;
        annotatedImageUrl?: string | null;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "保存批注失败。");
      }

      onAnnotatedImageChange?.(payload.annotatedImageUrl ?? null);
      setStatus("批注已保存，下载将包含这些标记。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存批注失败。");
      setStatus(null);
    } finally {
      setSaving(false);
    }
  }, [onAnnotatedImageChange, stepId]);

  const clearAnnotations = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;

    setSaving(true);
    setError(null);
    try {
      const backgroundIds = new Set(
        editor
          .getCurrentPageShapes()
          .filter((shape) => shape.meta?.role === "translated-background")
          .map((shape) => shape.id),
      );

      const removable = [...editor.getCurrentPageShapeIds()].filter(
        (id) => !backgroundIds.has(id),
      );
      if (removable.length > 0) {
        editor.deleteShapes(removable);
      }

      const response = await fetch(`/api/steps/${stepId}/annotations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "清除批注失败。");
      }

      onAnnotatedImageChange?.(null);
      setStatus("已清除批注。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "清除批注失败。");
    } finally {
      setSaving(false);
    }
  }, [onAnnotatedImageChange, stepId]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-medium">协作批注</p>
          <p className="text-xs text-muted-foreground">
            在译图上圈选、标注或手写反馈。保存后，下载会带上这些标记。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={saving || !ready}
            onClick={() => void clearAnnotations()}
          >
            <Eraser className="size-4" aria-hidden />
            清除
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={saving || !ready}
            onClick={() => void persist()}
          >
            <Save className="size-4" aria-hidden />
            {saving ? "保存中…" : "保存批注"}
          </Button>
        </div>
      </div>

      <div className="relative h-[min(72vh,760px)] overflow-hidden rounded-xl border border-border/70 bg-muted/20">
        <Tldraw
          onMount={(editor) => {
            editorRef.current = editor;
            onEditorReady?.(editor);
            editor.user.updateUserPreferences({ colorScheme: "light" });

            void (async () => {
              if (seededRef.current) return;
              seededRef.current = true;

              try {
                if (initialDocument) {
                  loadSnapshot(editor.store, initialDocument);
                  refreshBackgroundImageSrc(editor, imageUrl);
                  editor.zoomToFit({ animation: { duration: 0 } });
                  editor.setCurrentTool("draw");
                } else {
                  const { width, height } = await measureImage(imageUrl);
                  seedTranslatedImage(editor, imageUrl, width, height);
                }
                setReady(true);
              } catch (err) {
                setError(err instanceof Error ? err.message : "初始化画布失败。");
              }
            })();
          }}
          components={{
            SharePanel: null,
          }}
        />
        {!ready ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40">
            <DefaultSpinner />
          </div>
        ) : null}
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Pencil className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <p>
          使用工具栏绘制箭头、矩形、荧光笔或文字。按{" "}
          <kbd className="rounded border px-1">V</kbd> 选择，
          <kbd className="rounded border px-1">D</kbd> 画笔。
        </p>
      </div>

      {status ? <p className="text-xs text-primary">{status}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
