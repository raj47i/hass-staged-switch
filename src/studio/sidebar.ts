import type { HomeAssistant } from "../shared/types";
import {
  STUDIO_CARD_TYPE,
  STUDIO_DASHBOARD_PATH,
  STUDIO_ICON,
  STUDIO_TITLE,
} from "./const";

export interface LovelaceDashboard {
  id: string;
  url_path: string;
  title?: string;
  icon?: string;
  show_in_sidebar?: boolean;
  require_admin?: boolean;
  mode?: string;
}

export const studioViewConfig = () => ({
  type: "panel",
  title: STUDIO_TITLE,
  path: "studio",
  icon: STUDIO_ICON,
  cards: [{ type: STUDIO_CARD_TYPE, editor: true }],
});

export const studioLovelaceConfig = () => ({
  title: STUDIO_TITLE,
  views: [studioViewConfig()],
});

export const isStudioDashboard = (
  item?: Partial<LovelaceDashboard> | null,
): boolean => item?.url_path === STUDIO_DASHBOARD_PATH;

export const findStudioDashboard = (
  dashboards: LovelaceDashboard[] = [],
): LovelaceDashboard | undefined => dashboards.find(isStudioDashboard);

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export const configHasStudioCard = (config: unknown): boolean => {
  const views = asRecord(config)?.views;
  if (!Array.isArray(views)) {
    return false;
  }
  return views.some((view) => {
    const cards = asRecord(view)?.cards;
    return (
      Array.isArray(cards) &&
      cards.some((card) => asRecord(card)?.type === STUDIO_CARD_TYPE)
    );
  });
};

export const isEmptyLovelaceConfig = (config: unknown): boolean => {
  const views = asRecord(config)?.views;
  return !Array.isArray(views) || views.length === 0;
};

export const studioConfigNeedsEditorFlag = (config: unknown): boolean => {
  const views = asRecord(config)?.views;
  if (!Array.isArray(views)) {
    return true;
  }
  return views.some((view) => {
    const cards = asRecord(view)?.cards;
    return (
      Array.isArray(cards) &&
      cards.some((card) => {
        const rec = asRecord(card);
        return rec?.type === STUDIO_CARD_TYPE && rec.editor !== true;
      })
    );
  });
};

const canManageDashboards = (hass?: HomeAssistant): boolean =>
  Boolean(hass?.callWS) && hass?.user?.is_admin !== false;

const callWS = async <T>(
  hass: HomeAssistant | undefined,
  msg: Record<string, unknown>,
): Promise<T> => {
  if (!hass?.callWS) {
    throw new Error("Home Assistant websocket is not available");
  }
  return hass.callWS<T>(msg);
};

export const listStudioDashboards = (
  hass?: HomeAssistant,
): Promise<LovelaceDashboard[]> =>
  callWS<LovelaceDashboard[]>(hass, { type: "lovelace/dashboards/list" });

const saveStudioConfig = (hass?: HomeAssistant): Promise<unknown> =>
  callWS(hass, {
    type: "lovelace/config/save",
    url_path: STUDIO_DASHBOARD_PATH,
    config: studioLovelaceConfig(),
  });

const fillStudioConfig = async (hass?: HomeAssistant): Promise<void> => {
  try {
    const config = await callWS<unknown>(hass, {
      type: "lovelace/config",
      url_path: STUDIO_DASHBOARD_PATH,
    });
    if (isEmptyLovelaceConfig(config) || studioConfigNeedsEditorFlag(config)) {
      await saveStudioConfig(hass);
    }
  } catch {
    await saveStudioConfig(hass);
  }
};

export const ensureStudioDashboard = async (
  hass?: HomeAssistant,
): Promise<LovelaceDashboard | undefined> => {
  if (!canManageDashboards(hass)) {
    return undefined;
  }
  const listed = await listStudioDashboards(hass);
  let dashboard = findStudioDashboard(listed);
  if (!dashboard) {
    dashboard = await callWS<LovelaceDashboard>(hass, {
      type: "lovelace/dashboards/create",
      url_path: STUDIO_DASHBOARD_PATH,
      title: STUDIO_TITLE,
      icon: STUDIO_ICON,
      show_in_sidebar: true,
      require_admin: true,
    });
  }
  if (!dashboard?.id) {
    dashboard = findStudioDashboard(await listStudioDashboards(hass));
  }
  await fillStudioConfig(hass);
  return dashboard;
};

export const readStudioSidebar = async (
  hass?: HomeAssistant,
): Promise<boolean | undefined> => {
  if (!canManageDashboards(hass)) {
    return undefined;
  }
  try {
    const dashboard = findStudioDashboard(await listStudioDashboards(hass));
    return dashboard ? Boolean(dashboard.show_in_sidebar) : false;
  } catch {
    return undefined;
  }
};

export const setStudioSidebar = async (
  hass: HomeAssistant | undefined,
  show: boolean,
): Promise<boolean> => {
  const dashboard = await ensureStudioDashboard(hass);
  if (!dashboard?.id) {
    throw new Error("Could not add Scene Studio under Settings → Dashboards");
  }
  await callWS(hass, {
    type: "lovelace/dashboards/update",
    dashboard_id: dashboard.id,
    show_in_sidebar: show,
  });
  return show;
};

export const startStudioSidebar = (): void => {
  if (typeof document === "undefined") {
    return;
  }
  let tries = 0;
  const boot = (): void => {
    const ha = document.querySelector("home-assistant") as
      | { hass?: HomeAssistant }
      | null;
    if (ha?.hass) {
      void ensureStudioDashboard(ha.hass).catch(() => undefined);
      return;
    }
    if (tries < 40) {
      tries += 1;
      window.setTimeout(boot, 250);
    }
  };
  boot();
};
