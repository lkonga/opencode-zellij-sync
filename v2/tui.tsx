/**
 * opencode-zellij-sync — V2 TUI port (host entrypoint).
 *
 * V1 entrypoint (`dist/tui.js`, built from `src/tui.ts`) is untouched and keeps
 * loading under the V1 runtime. This file is the V2 equivalent, using only the
 * public V2 TUI plugin API.
 *
 * Behaviour parity with V1 `src/tui.ts`:
 *   - slash/palette command "Sync zellij pane title" → `/zellij-sync`
 *     (group "Session", palette entry, no keybind);
 *   - silent auto-sync on session title changes and new sessions;
 *   - delayed initial syncs (2s, 5s) because the route/session store may not be
 *     ready when the plugin loads;
 *   - all rename/guard/toast behaviour lives in ./zellij-sync.ts and the setup
 *     wiring in ./plugin.ts (both host-free and unit tested).
 *
 * V2 API surface used (pinned source /home/lkonga/codes/opencode-v2-scrollfix):
 *   - Plugin.define / Definition            packages/plugin/src/tui/plugin.ts:7-14
 *   - Context.keymap.layer()                packages/plugin/src/tui/context.ts:410-412
 *   - KeymapCommand (id/title/group/palette/slash/bind/run)
 *                                          packages/plugin/src/tui/context.ts:354-380
 *   - Context.ui.slot (append claim)        packages/plugin/src/tui/context.ts:462-463
 *
 * Registration: this directory is referenced from cli.json `plugins` (V2 has no
 * tui.json; cli.json `plugins` is read at packages/tui/src/plugin/context.tsx:233).
 * The host resolves a local plugin directory as `<dir>/tui`
 * (packages/tui/src/plugin/context.tsx:562-567) and validates the default export
 * against the id+setup loader contract
 * (packages/tui/src/plugin/context.tsx:577-587). The runtime host maps the bare
 * specifier `@opencode/plugin/tui` to its embedded V2 API module.
 *
 * Keybind note: V2 keybind ids are validated against a fixed table and unknown
 * ids are fatal (packages/tui/src/config/keybind.ts). V1 had no keybind for this
 * command, so the port declares `bind: false` — no keybind id is invented and no
 * user keybind config is required (packages/tui/src/context/keymap.tsx:240).
 *
 * `keymap.layer()` is a Solid hook and must run inside a rendered component, so
 * the command layer is registered from a component claimed on the "app" slot —
 * the same pattern as the proven reference port opencode-pool-guard/v2 and the
 * canonical program scaffold `.v2-ports/opencode-reload/v2`.
 */
import type { Context } from "@opencode/plugin/tui"
import { createZellijSyncPlugin } from "./plugin.ts"
import { zellijSyncLayerInput, type SyncContext } from "./zellij-sync.ts"

function ZellijSyncCommands(props: { context: Context }) {
  props.context.keymap.layer(() => zellijSyncLayerInput(props.context as SyncContext))
  return null
}

export default createZellijSyncPlugin({
  render: (context) => <ZellijSyncCommands context={context} />,
})
