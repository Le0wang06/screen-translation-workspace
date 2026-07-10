import type { Editor } from "tldraw";

export async function exportAnnotatedPng(editor: Editor) {
  const shapeIds = [...editor.getCurrentPageShapeIds()];
  if (shapeIds.length === 0) {
    throw new Error("画布为空。");
  }

  const { blob } = await editor.toImage(shapeIds, {
    format: "png",
    background: false,
    padding: 0,
    pixelRatio: 2,
    scale: 1,
  });

  return blob;
}
