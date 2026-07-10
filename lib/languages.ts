export const DEFAULT_TARGET_LANGUAGE = "zh";

export const TARGET_LANGUAGES = [
  { value: "zh", label: "中文" },
  { value: "en", label: "英文" },
  { value: "ja", label: "日文" },
  { value: "ko", label: "韩文" },
  { value: "es", label: "西班牙语" },
  { value: "fr", label: "法语" },
  { value: "de", label: "德语" },
] as const;

const LANGUAGE_LABELS = new Map<string, string>(
  TARGET_LANGUAGES.map((language) => [language.value, language.label]),
);

export function formatLanguageLabel(code: string | null | undefined) {
  if (!code) return "自动检测";
  return LANGUAGE_LABELS.get(code.toLowerCase()) ?? code;
}
