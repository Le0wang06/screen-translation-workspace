export type NormalizedBBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type UiTextStyle = {
  color: string;
  background: string;
  font_weight?: "normal" | "medium" | "semibold" | "bold";
  align?: "left" | "center" | "right";
  kind?: "heading" | "title" | "body" | "status" | "button" | "link";
};

export type UiTextBlock = {
  source_text: string;
  translated_text: string;
  bbox: NormalizedBBox;
  style: UiTextStyle;
};

export type UiExtractionResult = {
  title: string;
  summary: string;
  source_language?: string;
  blocks: UiTextBlock[];
};
