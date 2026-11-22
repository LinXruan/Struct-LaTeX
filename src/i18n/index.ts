import { EN_MESSAGES } from "./en";
import { I18nKey, I18nMessages, LanguageSetting, Locale } from "./types";
import { ZH_MESSAGES } from "./zh";

export type { I18nKey, I18nMessages, LanguageSetting, Locale } from "./types";

const DICTIONARIES: Record<Locale, I18nMessages> = {
  zh: ZH_MESSAGES,
  en: EN_MESSAGES,
};

let activeLocale: Locale = "zh";

export function mapRawLanguageToLocale(rawLang: string | null | undefined): Locale {
  const norm = (rawLang ?? "").trim().toLowerCase();
  return norm.startsWith("zh") ? "zh" : "en";
}

export function resolveAppLocale(setting: LanguageSetting | undefined, obsidianRawLang: string | null | undefined): Locale {
  if (setting === "zh" || setting === "en") return setting;
  return mapRawLanguageToLocale(obsidianRawLang);
}

export function setLocale(locale: Locale): void {
  activeLocale = locale;
}

export function getLocale(): Locale {
  return activeLocale;
}

export function t(key: I18nKey, vars?: Record<string, string | number>, locale?: Locale): string {
  const dict = DICTIONARIES[locale ?? activeLocale] ?? ZH_MESSAGES;
  let text = dict[key];
  if (!vars) return text;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return text;
}
