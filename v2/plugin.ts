/**
 * opencode-zellij-sync — V2 plugin definition and setup wiring (host-free).
 *
 * Split out of ./tui.tsx so the loader contract and the setup wiring are
 * testable without a Solid/JSX runtime: `tui.tsx` only supplies the rendered
 * component that registers the keymap layer.
 *
 * V2 API surface used (pinned source /home/lkonga/codes/opencode-v2-scrollfix):
 *   - Plugin.define / Definition                packages/plugin/src/tui/plugin.ts:7-14
 *   - Context.ui.slot (append claim)            packages/plugin/src/tui/context.ts:462-463
 *   - Context.data.on(type, handler)            packages/plugin/src/tui/context.ts:59-64
 *   - Context.data.session.get()                packages/plugin/src/tui/context.ts:65-71
 *   - V2 `session.renamed` (title changed)      packages/schema/src/session-event.ts:98-106
 *   - V2 `session.created` (new session)        packages/schema/src/session-event.ts:48-64
 */
import { Plugin, type Context } from "@opencode/plugin/tui"
import {
  getSessionTitle,
  sessionIDFromRoute,
  syncPaneTitle,
  type SyncContext,
} from "./zellij-sync.ts"

export const PLUGIN_ID = "opencode-zellij-sync-v2-tui"

/** V1 parity: initial syncs are deferred twice (2s, 5s). */
export const INITIAL_SYNC_DELAYS_MS = [2_000, 5_000] as const

export interface ZellijSyncHooks {
  /**
   * Renders the component that registers the command layer. `keymap.layer()`
   * is a Solid hook and must run inside a rendered component, so the layer is
   * claimed through the host's slot tree rather than from `setup()`.
   */
  readonly render: (context: Context) => unknown
}

export function createZellijSyncPlugin(hooks: ZellijSyncHooks) {
  return Plugin.define({
    id: PLUGIN_ID,
    setup: (context: Context) => {
      const ctx = context as SyncContext

      // Silent auto-sync. V1 listened on `session.updated`; V2 splits that into
      // `session.renamed` (title) and `session.created` (new session).
      const doSync = (title?: string) => {
        const resolved = title ?? getSessionTitle(ctx)
        if (resolved) syncPaneTitle(ctx, resolved, false)
      }

      const offRenamed = context.data.on("session.renamed", (event) => {
        if (sessionIDFromRoute(ctx) === event.data.sessionID) doSync(event.data.title)
        else doSync()
      })
      const offCreated = context.data.on("session.created", (event) => {
        if (sessionIDFromRoute(ctx) === event.data.sessionID) doSync(event.data.title)
        else doSync()
      })

      // Delayed initial syncs — the route may not be ready immediately (V1 parity).
      const initialSyncs = INITIAL_SYNC_DELAYS_MS.map((delay) => setTimeout(() => doSync(), delay))

      const disposeSlot = context.ui.slot({
        append: "app",
        render: () => hooks.render(context),
      })

      return () => {
        for (const timer of initialSyncs) clearTimeout(timer)
        offRenamed()
        offCreated()
        disposeSlot()
      }
    },
  })
}
