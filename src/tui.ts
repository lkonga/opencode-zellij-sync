import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

function findZellij(): string {
  const home = process.env.HOME || "";
  const paths = [
    join(home, ".cargo", "bin", "zellij"),
    "/usr/local/bin/zellij",
    "/usr/bin/zellij",
  ];
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return "zellij";
}

function renamePane(title: string): boolean {
  try {
    const paneId = process.env.ZELLIJ_PANE_ID;
    const args = paneId
      ? ["action", "rename-pane", "--pane-id", paneId, title]
      : ["action", "rename-pane", title];
    spawn(findZellij(), args, { detached: true, stdio: "ignore" }).unref();
    return true;
  } catch {
    return false;
  }
}

function getSessionTitle(api: TuiPluginApi): string | undefined {
  const route = api.route.current as { name?: string; params?: { sessionID?: string } };
  const sessionID = route?.name === "session" ? route.params?.sessionID : undefined;
  if (sessionID) {
    const session = (api.state.session as any).get?.(sessionID);
    return session?.title;
  }
  return undefined;
}

function syncPaneTitle(api: TuiPluginApi, title?: string, toast = true) {
  if (!process.env.ZELLIJ) {
    if (toast) api.ui.toast({ variant: "warning", title: "Zellij Sync", message: "Not inside zellij" });
    return;
  }

  if (!title) {
    if (toast) api.ui.toast({ variant: "warning", title: "Zellij Sync", message: "No session title found" });
    return;
  }

  if (renamePane(title)) {
    if (toast) api.ui.toast({ variant: "success", title: "Zellij Sync", message: `Pane title: ${title}` });
  } else {
    if (toast) api.ui.toast({ variant: "error", title: "Zellij Sync", message: "Failed to rename pane" });
  }
}

const tui: TuiPlugin = async (api) => {
  api.command.register(() => [
    {
      title: "Sync zellij pane title",
      value: "zellij-sync",
      category: "Session",
      description: "Sync the current opencode session title to the zellij pane title",
      slash: { name: "zellij-sync" },
      onSelect: () => {
        syncPaneTitle(api, getSessionTitle(api));
      },
    },
  ]);

  // Auto-sync on session change and on load
  const doSync = () => {
    const title = getSessionTitle(api);
    if (title) syncPaneTitle(api, title, false);
  };

  // Sync when route changes (covers load + session switch)
  api.event.on("session.updated" as any, () => doSync());

  // Delayed initial sync — route may not be ready immediately
  setTimeout(doSync, 2000);
  setTimeout(doSync, 5000);
};

export default { id: "opencode-zellij-sync", tui } as TuiPluginModule & { id: string };
