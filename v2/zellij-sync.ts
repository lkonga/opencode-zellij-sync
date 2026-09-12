/**
 * opencode-zellij-sync — V2 pure core (host- and Solid-free).
 *
 * V2 port of the V1 TUI plugin (`src/tui.ts` on the V1 branch, loaded by the
 * V1 runtime from `dist/tui.js`). Behaviour is preserved exactly:
 *   - resolve the zellij binary (cargo bin, then /usr/local/bin, /usr/bin, PATH);
 *   - rename the current zellij pane to the active OpenCode session title;
 *   - `zellij action rename-pane --pane-id $ZELLIJ_PANE_ID <title>` when
 *     ZELLIJ_PANE_ID is set, otherwise `zellij action rename-pane <title>`;
 *   - toast feedback only on explicit invocation (auto-sync is silent);
 *   - guards: "Not inside zellij" and "No session title found".
 *
 * Everything host-specific (route, session store, toasts) is expressed through
 * the minimal structural `SyncContext` interface below so this module is
 * testable without the OpenCode host and without Solid.
 *
 * V2 API ground truth used by the caller (`./tui.tsx`), pinned source
 * /home/lkonga/codes/opencode-v2-scrollfix:
 *   - Route union (session variant carries `sessionID`)
 *                                       packages/plugin/src/tui/context.ts:136-144
 *   - Context.ui.router.current()        packages/plugin/src/tui/context.ts:438-442
 *   - Context.ui.toast.show()            packages/plugin/src/tui/context.ts:242-253
 *   - Context.data.session.get()         packages/plugin/src/tui/context.ts:65-71
 *   - SessionInfo.title                  packages/client/src/promise/generated/types.ts:1504-1520
 */
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

export type ToastVariant = "info" | "success" | "warning" | "error"

export interface ToastOptions {
  readonly title?: string
  readonly message: string
  readonly variant?: ToastVariant
  readonly duration?: number
}

export type Route =
  | { readonly type: "home" }
  | { readonly type: "session"; readonly sessionID: string }
  | {
      readonly type: "plugin"
      readonly id: string
      readonly name: string
      readonly data?: Record<string, unknown>
    }

/** Minimal slice of `Plugin.Context` this port needs (structurally compatible). */
export interface SyncContext {
  readonly ui: {
    readonly toast: { show(options: ToastOptions): void }
    readonly router: { current(): Route }
  }
  readonly data: {
    readonly session: { get(sessionID: string): { readonly title?: string } | undefined }
  }
}

export const TOAST_TITLE = "Zellij Sync"

/** Locate the zellij binary. Mirrors V1 `findZellij()`. */
export function findZellij(): string {
  const home = process.env.HOME || ""
  const paths = [
    join(home, ".cargo", "bin", "zellij"),
    "/usr/local/bin/zellij",
    "/usr/bin/zellij",
  ]
  for (const p of paths) {
    if (existsSync(p)) return p
  }
  return "zellij"
}

/** Pane-id targeting args. Mirrors V1 `renamePane()` argument construction. */
export function buildRenameArgs(title: string, paneId?: string): string[] {
  return paneId
    ? ["action", "rename-pane", "--pane-id", paneId, title]
    : ["action", "rename-pane", title]
}

/** Fire-and-forget pane rename. Mirrors V1 `renamePane()`. */
export function renamePane(
  title: string,
  options?: { readonly zellij?: string; readonly paneId?: string },
): boolean {
  try {
    const zellij = options?.zellij ?? findZellij()
    const paneId = options?.paneId ?? process.env.ZELLIJ_PANE_ID
    spawn(zellij, buildRenameArgs(title, paneId), { detached: true, stdio: "ignore" }).unref()
    return true
  } catch {
    return false
  }
}

/** Active session id from the V2 route union. V1 used `route.name`/`route.params`. */
export function sessionIDFromRoute(context: SyncContext): string | undefined {
  const route = context.ui.router.current()
  return route.type === "session" ? route.sessionID : undefined
}

/** Session title for the active route, or undefined when there is none. */
export function getSessionTitle(context: SyncContext): string | undefined {
  const sessionID = sessionIDFromRoute(context)
  if (!sessionID) return undefined
  return context.data.session.get(sessionID)?.title
}

/**
 * Rename the zellij pane to `title` (resolved from the route when omitted).
 * Returns whether a rename was attempted successfully. Mirrors V1
 * `syncPaneTitle()`: explicit invocations toast, auto-sync stays silent.
 */
export function syncPaneTitle(
  context: SyncContext,
  title?: string,
  toast = true,
  rename: (title: string) => boolean = renamePane,
): boolean {
  if (!process.env.ZELLIJ) {
    if (toast) context.ui.toast.show({ variant: "warning", title: TOAST_TITLE, message: "Not inside zellij" })
    return false
  }

  if (!title) {
    if (toast) context.ui.toast.show({ variant: "warning", title: TOAST_TITLE, message: "No session title found" })
    return false
  }

  if (rename(title)) {
    if (toast) context.ui.toast.show({ variant: "success", title: TOAST_TITLE, message: `Pane title: ${title}` })
    return true
  }

  if (toast) context.ui.toast.show({ variant: "error", title: TOAST_TITLE, message: "Failed to rename pane" })
  return false
}

/** Command id / slash name. V1 used `value: "zellij-sync"` and `slash.name`. */
export const COMMAND_ID = "zellij-sync"

export interface ZellijSyncCommand {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly group: string
  readonly palette: true
  readonly slash: { readonly name: string }
  /**
   * V1 declared no keybind for this command. `false` disables automatic
   * binding so the port never invents a keybind id
   * (packages/tui/src/context/keymap.tsx:240 returns before the config lookup).
   */
  readonly bind: false
  readonly run: () => void
}

export interface ZellijSyncLayer {
  /** "global" keeps the command reachable from every route (not just "base"). */
  readonly mode: "global"
  readonly commands: readonly ZellijSyncCommand[]
}

/**
 * The keymap layer this plugin contributes. Kept host-free so it is unit
 * testable; the rendered component in ./tui.tsx hands it to
 * `Context.keymap.layer()` (packages/plugin/src/tui/context.ts:410-412).
 */
export function zellijSyncLayerInput(context: SyncContext): ZellijSyncLayer {
  return {
    mode: "global",
    commands: [
      {
        id: COMMAND_ID,
        title: "Sync zellij pane title",
        description: "Sync the current opencode session title to the zellij pane title",
        group: "Session",
        palette: true,
        slash: { name: COMMAND_ID },
        bind: false,
        run: () => {
          syncPaneTitle(context, getSessionTitle(context))
        },
      },
    ],
  }
}
