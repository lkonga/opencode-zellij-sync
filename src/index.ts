import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

interface PluginConfig {
  debug: boolean;
}

function loadConfig(): PluginConfig {
  return {
    debug: process.env.OPENCODE_ZN_DEBUG === "1",
  };
}

function createLogger(debug: boolean) {
  return {
    debug: (msg: string) => console.error(`[zellij-sync] ${msg}`),
    error: (msg: string) => console.error(`[zellij-sync] ERROR: ${msg}`),
  };
}

export function findZellij(log: ReturnType<typeof createLogger>): string {
  const home = process.env.HOME || "";
  const paths = [
    join(home, ".cargo", "bin", "zellij"),
    "/usr/local/bin/zellij",
    "/usr/bin/zellij",
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      log.debug(`Found zellij at: ${p}`);
      return p;
    }
  }
  return "zellij";
}

export function renamePane(title: string, zellij: string, log: ReturnType<typeof createLogger>): boolean {
  try {
    spawn(zellij, ["action", "rename-pane", title], { detached: true, stdio: "ignore" }).unref();
    log.debug(`Synced pane title to: ${title}`);
    return true;
  } catch (e) {
    log.error(`Rename pane failed: ${e instanceof Error ? e.message : "unknown"}`);
    return false;
  }
}

function extractTitle(event: unknown): string | null {
  if (!event || typeof event !== "object") return null;
  const e = event as Record<string, unknown>;
  const props = e.properties;
  if (props && typeof props === "object") {
    const p = props as Record<string, unknown>;
    const info = p.info;
    if (info && typeof info === "object") {
      const i = info as Record<string, unknown>;
      if (typeof i.title === "string") {
        if (i.parentID != null) return null;
        return i.title;
      }
    }
    if (typeof p.title === "string") return p.title;
  }
  if (typeof e.title === "string") return e.title;
  const directInfo = e.info;
  if (directInfo && typeof directInfo === "object") {
    const i = directInfo as Record<string, unknown>;
    if (typeof i.title === "string" && i.parentID == null) return i.title;
  }
  return null;
}

export const ZellijNamer = async () => {
  const config = loadConfig();
  const log = createLogger(config.debug);
  const zellij = findZellij(log);
  let lastTitle = "";

  function isInZellij(): boolean {
    return Boolean(process.env.ZELLIJ);
  }

  async function syncFromEnv(): Promise<void> {
    if (!isInZellij()) {
      log.debug("Skipped: not in zellij");
      return;
    }
    const session = process.env.ZELLIJ_SESSION_NAME;
    if (!session) {
      log.debug("Skipped: no ZELLIJ_SESSION_NAME");
      return;
    }
    if (session === lastTitle) return;
    if (renamePane(session, zellij, log)) {
      lastTitle = session;
    }
  }

  async function syncFromEvent(title: string): Promise<void> {
    if (!isInZellij()) {
      log.debug("Skipped: not in zellij");
      return;
    }
    if (title === lastTitle) return;
    if (renamePane(title, zellij, log)) {
      lastTitle = title;
    }
  }

  process.nextTick(() => syncFromEnv().catch((e) => log.error(e?.message || "unknown")));

  return {
    event: async ({ event }: { event: unknown }) => {
      if (!event || typeof event !== "object") return;
      const e = event as { type?: string };
      if (e.type === "session.updated") {
        const title = extractTitle(event);
        if (!title) return;
        if (title === "Retitle generation" || title === "Retitle Session") return;
        log.debug(`session.updated — title: ${title}`);
        if (title) {
          process.nextTick(() => syncFromEvent(title).catch((err) => log.error(err?.message || "unknown")));
        }
      }
    },
  };
};

export default ZellijNamer;
