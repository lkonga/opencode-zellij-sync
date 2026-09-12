/**
 * Loader-contract and registration-surface tests.
 *
 * These import ./plugin.ts (host-free, no JSX) so they run anywhere — including
 * a plain root `bun install` in CI, where only the committed
 * `node_modules/@opencode/plugin/tui` stand-in is available. The thin JSX
 * boundary in ./tui.tsx is exercised by the bounded V2 TUI runtime smoke.
 *
 * Covered:
 *   1. Loader contract: the default export shape the V2 TUI loader accepts —
 *      id + setup (packages/tui/src/plugin/context.tsx:577-587).
 *   2. Registration surface: setup() claims the "app" slot (append) and hands
 *      the host a component, so keymap.layer() runs inside a rendered component.
 *   3. Event wiring: silent auto-sync on `session.renamed` / `session.created`
 *      (V1's `session.updated` equivalent) with cleanup.
 *   4. Command layer: `/zellij-sync` slash + palette entry, no invented keybind.
 */
import { describe, expect, test } from "bun:test"
import { createZellijSyncPlugin, INITIAL_SYNC_DELAYS_MS, PLUGIN_ID } from "../plugin.ts"
import { COMMAND_ID, zellijSyncLayerInput } from "../zellij-sync.ts"

function fakeContext(route: any = { type: "session", sessionID: "ses_1" }, title?: string) {
  const toasts: any[] = []
  const claims: any[] = []
  const listeners: Array<{ type: string; handler: (event: any) => void }> = []
  const unsubscribed: string[] = []
  const context: any = {
    options: {},
    keymap: { layer: () => {}, dispatch: () => {} },
    ui: {
      toast: { show: (options: any) => toasts.push(options) },
      router: { current: () => route },
      slot: (claim: any) => {
        claims.push(claim)
        return () => {}
      },
    },
    data: {
      on: (type: string, handler: (event: any) => void) => {
        listeners.push({ type, handler })
        return () => {
          unsubscribed.push(type)
        }
      },
      session: { get: (sessionID: string) => (sessionID === "ses_1" ? { title } : undefined) },
    },
  }
  return { context, toasts, claims, listeners, unsubscribed }
}

const plugin = createZellijSyncPlugin({
  render: (context) => {
    return { rendered: context !== undefined }
  },
})

describe("V2 loader contract", () => {
  test("default export satisfies the host isPlugin predicate (id + setup)", () => {
    expect(typeof plugin).toBe("object")
    expect(plugin).not.toBeNull()
    expect(typeof plugin.id).toBe("string")
    expect(plugin.id.length).toBeGreaterThan(0)
    expect(typeof plugin.setup).toBe("function")
  })

  test("plugin id identifies the V2 port", () => {
    expect(plugin.id).toBe(PLUGIN_ID)
    expect(PLUGIN_ID).toBe("opencode-zellij-sync-v2-tui")
  })

  test("V1 parity: initial syncs are deferred twice (2s, 5s)", () => {
    expect([...INITIAL_SYNC_DELAYS_MS]).toEqual([2000, 5000])
  })
})

describe("registration surface (setup)", () => {
  test("claims the app slot (append) with a rendered component and returns cleanup", () => {
    const { context, claims } = fakeContext()
    const cleanup = plugin.setup(context)
    expect(claims.length).toBe(1)
    expect(claims[0].append).toBe("app")
    expect(typeof claims[0].render).toBe("function")
    expect(claims[0].render()).toEqual({ rendered: true })
    expect(typeof cleanup).toBe("function")
    ;(cleanup as () => void)()
  })

  test("subscribes to the V2 session events and unsubscribes on cleanup", () => {
    const { context, listeners, unsubscribed } = fakeContext()
    const cleanup = plugin.setup(context)
    expect(listeners.map((item) => item.type).sort()).toEqual(["session.created", "session.renamed"])
    ;(cleanup as () => void)()
    expect(unsubscribed.sort()).toEqual(["session.created", "session.renamed"])
  })

  test("auto-sync stays silent (no toast) on a matching session.renamed", () => {
    const original = process.env.ZELLIJ
    delete process.env.ZELLIJ
    try {
      const { context, listeners, toasts } = fakeContext({ type: "session", sessionID: "ses_1" }, "zjs-feat")
      const cleanup = plugin.setup(context)
      const renamed = listeners.find((item) => item.type === "session.renamed")!
      renamed.handler({ type: "session.renamed", data: { sessionID: "ses_1", title: "zjs-fix" } })
      expect(toasts).toEqual([])
      ;(cleanup as () => void)()
    } finally {
      if (original !== undefined) process.env.ZELLIJ = original
    }
  })
})

describe("command layer (/zellij-sync)", () => {
  test("exposes the V1 command as a palette + slash entry with no invented keybind", () => {
    const { context } = fakeContext()
    const layer = zellijSyncLayerInput(context)
    expect(layer.mode).toBe("global")
    expect(layer.commands.length).toBe(1)
    const command = layer.commands[0]!
    expect(command.id).toBe(COMMAND_ID)
    expect(COMMAND_ID).toBe("zellij-sync")
    expect(command.title).toBe("Sync zellij pane title")
    expect(command.description).toBe("Sync the current opencode session title to the zellij pane title")
    expect(command.group).toBe("Session")
    expect(command.palette).toBe(true)
    expect(command.slash).toEqual({ name: "zellij-sync" })
    // Unknown keybind ids are fatal in V2 — the port must not invent one.
    expect(command.bind).toBe(false)
  })

  test("running the command syncs the active title (warns outside zellij)", () => {
    const original = process.env.ZELLIJ
    delete process.env.ZELLIJ
    try {
      const { context, toasts } = fakeContext({ type: "session", sessionID: "ses_1" }, "zjs-feat")
      zellijSyncLayerInput(context).commands[0]!.run()
      expect(toasts).toEqual([{ variant: "warning", title: "Zellij Sync", message: "Not inside zellij" }])
    } finally {
      if (original !== undefined) process.env.ZELLIJ = original
    }
  })

  test("running the command without a session title warns instead of renaming", () => {
    const original = process.env.ZELLIJ
    process.env.ZELLIJ = "1"
    try {
      const { context, toasts } = fakeContext({ type: "home" })
      zellijSyncLayerInput(context).commands[0]!.run()
      expect(toasts).toEqual([{ variant: "warning", title: "Zellij Sync", message: "No session title found" }])
    } finally {
      if (original === undefined) delete process.env.ZELLIJ
      else process.env.ZELLIJ = original
    }
  })
})
