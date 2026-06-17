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

function syncPaneTitle(api: TuiPluginApi, title?: string) {
  if (!process.env.ZELLIJ) {
    api.ui.toast({ variant: "warning", title: "Zellij Sync", message: "Not inside zellij" });
    return;
  }

  const session = title || process.env.ZELLIJ_SESSION_NAME;
  if (!session) {
    api.ui.toast({ variant: "warning", title: "Zellij Sync", message: "No session name to sync" });
    return;
  }

  try {
    const zellij = findZellij();
    spawn(zellij, ["action", "rename-pane", session], { detached: true, stdio: "ignore" }).unref();
    api.ui.toast({ variant: "success", title: "Zellij Sync", message: `Pane title: ${session}` });
  } catch (e) {
    api.ui.toast({ variant: "error", title: "Zellij Sync", message: `Failed: ${e instanceof Error ? e.message : "unknown"}` });
  }
}

const tui: TuiPlugin = async (api) => {
  api.command.register(() => [
    {
      title: "Sync zellij pane title",
      value: "zellij-sync",
      category: "Session",
      description: "Sync the current session title to the zellij pane title",
      slash: { name: "zellij-sync" },
      onSelect: () => {
        syncPaneTitle(api);
      },
    },
  ]);
};

export default { id: "opencode-zellij-sync", tui } as TuiPluginModule & { id: string };
