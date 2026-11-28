import { t } from "../i18n";
import { resolveFeatureKeybind } from "../input/keybindUtils";
import { DEFAULT_PLUGIN_SETTINGS, PluginSettings } from "../input/types";
import { BUILD_TAG } from "./settingAboutAndSpecial";
import { GeneralSettingsHost, SettingsSubPage } from "./settingGeneralSection";
import { createSettingCard, openActionMenu, renderNavRow } from "./settingNavComponents";
import type { LanguageSetting } from "../i18n";

function formatLanguageLabel(lang: LanguageSetting): string {
  if (lang === "zh") return t("settings.language.zh");
  if (lang === "en") return t("settings.language.en");
  return t("settings.language.auto");
}

function countEnabledJumpModes(settings: PluginSettings): number {
  let count = 0;
  if (settings.smartJumpEnabled) count++;
  if (settings.smartJumpRightMultiEnabled) count++;
  if (settings.smartJumpLeftSingleEnabled) count++;
  if (settings.smartJumpLeftMultiEnabled) count++;
  return count;
}

/**
 * Renders the grouped-card home screen with full-row clickable navigation items.
 */
export function renderSettingsHomePage(
  parent: HTMLElement,
  host: GeneralSettingsHost,
  callbacks: { onLanguageChanged: () => void; onOpenPage: (page: SettingsSubPage) => void }
): void {
  const { settings } = host;
  const ruleCount = host.ruleStore?.getRules().length ?? 0;
  const inputSummary = settings.smartInputEnabled
    ? `${t("settings.nav.summaryOn")} · ${t("settings.nav.summaryCount", { count: ruleCount })}`
    : t("settings.nav.summaryOff");

  const backspaceKey = resolveFeatureKeybind(
    settings.smartBackspaceKey,
    DEFAULT_PLUGIN_SETTINGS.smartBackspaceKey
  );
  const deleteSummary = settings.smartBackspaceEnabled ? backspaceKey : t("settings.nav.summaryOff");
  const jumpEnabledCount = countEnabledJumpModes(settings);

  const coreCard = createSettingCard(parent, t("settings.group.core"));
  renderNavRow(coreCard, {
    icon: "sparkles",
    title: t("settings.nav.input"),
    desc: t("settings.nav.inputDesc"),
    summary: inputSummary,
    statusDot: settings.smartInputEnabled ? "on" : "off",
    onClick: () => callbacks.onOpenPage("input"),
  });
  renderNavRow(coreCard, {
    icon: "delete",
    title: t("settings.nav.delete"),
    desc: t("settings.nav.deleteDesc"),
    summary: deleteSummary,
    summaryMonospace: settings.smartBackspaceEnabled,
    statusDot: settings.smartBackspaceEnabled ? "on" : "off",
    onClick: () => callbacks.onOpenPage("delete"),
  });
  renderNavRow(coreCard, {
    icon: "corner-down-right",
    title: t("settings.nav.jump"),
    desc: t("settings.nav.jumpDesc"),
    summary: t("settings.nav.jumpSummary", { count: jumpEnabledCount }),
    statusDot: jumpEnabledCount > 0 ? "on" : "off",
    onClick: () => callbacks.onOpenPage("jump"),
  });

  const generalCard = createSettingCard(parent, t("settings.group.general"));
  const langRow = renderNavRow(generalCard, {
    icon: "globe",
    title: t("settings.language.name"),
    desc: t("settings.language.desc"),
    summary: formatLanguageLabel(settings.language),
    trailingIcon: "chevrons-up-down",
    onClick: (ev) => {
      const options: Array<{ value: LanguageSetting; label: string }> = [
        { value: "auto", label: t("settings.language.auto") },
        { value: "zh", label: t("settings.language.zh") },
        { value: "en", label: t("settings.language.en") },
      ];
      openActionMenu(
        ev,
        langRow,
        options.map((opt) => ({
          title: opt.label,
          checked: settings.language === opt.value,
          onSelect: () => {
            void (async () => {
              if (settings.language === opt.value) return;
              settings.language = opt.value;
              await host.saveSettings();
              if (host.onLanguageUpdated) await host.onLanguageUpdated();
              else host.syncLocale();
              callbacks.onLanguageChanged();
            })();
          },
        }))
      );
    },
  });
  renderNavRow(generalCard, {
    icon: "sliders-horizontal",
    title: t("settings.nav.special"),
    desc: t("settings.nav.specialDesc"),
    onClick: () => callbacks.onOpenPage("special"),
  });

  const versionText = host.manifest ? `v${host.manifest.version} (${BUILD_TAG})` : `(${BUILD_TAG})`;
  renderNavRow(generalCard, {
    icon: "info",
    title: t("settings.nav.about"),
    desc: t("settings.nav.aboutDesc"),
    summary: versionText,
    onClick: () => callbacks.onOpenPage("about"),
  });
}
