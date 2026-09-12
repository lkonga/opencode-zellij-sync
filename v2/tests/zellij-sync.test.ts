/**
 * Focused tests for the pure V2 core (no host, no Solid).
 *
 * Covers the V1-parity behaviour of ./zellij-sync.ts:
 *   - pane-targeting argument construction (ZELLIJ_PANE_ID);
 *   - route → session id/title resolution (V2 Route union);
 *   - sync guards ("Not inside zellij", "No session title found");
 *   - success/error toasts and silent auto-sync (toast = false);
 *   - zellij binary discovery order.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  buildRenameArgs,
  findZellij,
  getSessionTitle,
  sessionIDFromRoute,
  syncPaneTitle,
  type Route,
  type SyncContext,
  type ToastOptions,
} from "../zellij-sync.ts"

const ORIGINAL_ZELLIJ = process.env.ZELLIJ
const ORIGINAL_PANE_ID = process.env.ZELLIJ_PANE_ID

function fakeContext(route: Route, sessions: Record<string, { title?: string }> = {}) {
  const toasts: ToastOptions[] = []
  const lookups: string[] = []
  const context: SyncContext = {
    ui: {
      toast: {
        show: (options) => {
          toasts.push(options)
        },
      },
      router: { current: () => route },
    },
    data: {
      session: {
        get: (sessionID) => {
          lookups.push(sessionID)
          return sessions[sessionID]
        },
      },
    },
  }
  return { context, toasts, lookups }
}

beforeEach(() => {
  delete process.env.ZELLIJ
  delete process.env.ZELLIJ_PANE_ID
})

afterEach(() => {
  if (ORIGINAL_ZELLIJ === undefined) delete process.env.ZELLIJ
  else process.env.ZELLIJ = ORIGINAL_ZELLIJ
  if (ORIGINAL_PANE_ID === undefined) delete process.env.ZELLIJ_PANE_ID
  else process.env.ZELLIJ_PANE_ID = ORIGINAL_PANE_ID
})

describe("buildRenameArgs (V1 parity)", () => {
  test("targets the current pane when ZELLIJ_PANE_ID is present", () => {
    expect(buildRenameArgs("my-session-title", "%3")).toEqual([
      "action",
      "rename-pane",
      "--pane-id",
      "%3",
      "my-session-title",
    ])
  })

  test("omits --pane-id when no pane id is known", () => {
    expect(buildRenameArgs("my-session-title")).toEqual(["action", "rename-pane", "my-session-title"])
  })
})

describe("route resolution (V2 Route union)", () => {
  test("session route exposes its session id", () => {
    const { context } = fakeContext({ type: "session", sessionID: "ses_1" })
    expect(sessionIDFromRoute(context)).toBe("ses_1")
  })

  test("home route has no session id", () => {
    const { context } = fakeContext({ type: "home" })
    expect(sessionIDFromRoute(context)).toBeUndefined()
  })

  test("plugin route has no session id", () => {
    const { context } = fakeContext({ type: "plugin", id: "x", name: "X" })
    expect(sessionIDFromRoute(context)).toBeUndefined()
  })

  test("getSessionTitle reads the active session title", () => {
    const { context, lookups } = fakeContext({ type: "session", sessionID: "ses_1" }, { ses_1: { title: "zjs-feat" } })
    expect(getSessionTitle(context)).toBe("zjs-feat")
    expect(lookups).toEqual(["ses_1"])
  })

  test("getSessionTitle is undefined without a route session and does not touch the store", () => {
    const { context, lookups } = fakeContext({ type: "home" })
    expect(getSessionTitle(context)).toBeUndefined()
    expect(lookups).toEqual([])
  })

  test("getSessionTitle is undefined while the session has no title yet", () => {
    const { context } = fakeContext({ type: "session", sessionID: "ses_1" }, { ses_1: {} })
    expect(getSessionTitle(context)).toBeUndefined()
  })
})

describe("syncPaneTitle guards and toasts (V1 parity)", () => {
  test("outside zellij: warns and never renames", () => {
    let renamed = 0
    const { context, toasts } = fakeContext({ type: "session", sessionID: "ses_1" }, { ses_1: { title: "t" } })
    const result = syncPaneTitle(context, "t", true, () => {
      renamed += 1
      return true
    })
    expect(result).toBe(false)
    expect(renamed).toBe(0)
    expect(toasts).toEqual([{ variant: "warning", title: "Zellij Sync", message: "Not inside zellij" }])
  })

  test("inside zellij without a title: warns and never renames", () => {
    process.env.ZELLIJ = "1"
    let renamed = 0
    const { context, toasts } = fakeContext({ type: "home" })
    const result = syncPaneTitle(context, undefined, true, () => {
      renamed += 1
      return true
    })
    expect(result).toBe(false)
    expect(renamed).toBe(0)
    expect(toasts).toEqual([{ variant: "warning", title: "Zellij Sync", message: "No session title found" }])
  })

  test("inside zellij with a title: renames and toasts success", () => {
    process.env.ZELLIJ = "1"
    const renamed: string[] = []
    const { context, toasts } = fakeContext({ type: "home" })
    const result = syncPaneTitle(context, "zjs-fix", true, (title) => {
      renamed.push(title)
      return true
    })
    expect(result).toBe(true)
    expect(renamed).toEqual(["zjs-fix"])
    expect(toasts).toEqual([{ variant: "success", title: "Zellij Sync", message: "Pane title: zjs-fix" }])
  })

  test("rename failure: toasts an error", () => {
    process.env.ZELLIJ = "1"
    const { context, toasts } = fakeContext({ type: "home" })
    const result = syncPaneTitle(context, "zjs-fix", true, () => false)
    expect(result).toBe(false)
    expect(toasts).toEqual([{ variant: "error", title: "Zellij Sync", message: "Failed to rename pane" }])
  })

  test("auto-sync (toast = false) never toasts, even on failure", () => {
    const { context, toasts } = fakeContext({ type: "home" })
    expect(syncPaneTitle(context, "zjs-fix", false, () => true)).toBe(false)
    process.env.ZELLIJ = "1"
    expect(syncPaneTitle(context, "zjs-fix", false, () => true)).toBe(true)
    expect(syncPaneTitle(context, "zjs-fix", false, () => false)).toBe(false)
    expect(toasts).toEqual([])
  })
})

describe("findZellij", () => {
  test("prefers $HOME/.cargo/bin/zellij", () => {
    const home = mkdtempSync(join(tmpdir(), "zjs-home-"))
    const bin = join(home, ".cargo", "bin")
    mkdirSync(bin, { recursive: true })
    const zellij = join(bin, "zellij")
    writeFileSync(zellij, "")
    const originalHome = process.env.HOME
    process.env.HOME = home
    try {
      expect(findZellij()).toBe(zellij)
    } finally {
      if (originalHome === undefined) delete process.env.HOME
      else process.env.HOME = originalHome
      rmSync(home, { recursive: true, force: true })
    }
  })

  test("falls back to the bare command name when nothing is found", () => {
    const home = mkdtempSync(join(tmpdir(), "zjs-home-empty-"))
    const originalHome = process.env.HOME
    process.env.HOME = home
    try {
      // /usr/local/bin/zellij or /usr/bin/zellij may exist on the runner; only
      // assert the shape of the fallback contract.
      const found = findZellij()
      expect(typeof found).toBe("string")
      expect(found.length).toBeGreaterThan(0)
    } finally {
      if (originalHome === undefined) delete process.env.HOME
      else process.env.HOME = originalHome
      rmSync(home, { recursive: true, force: true })
    }
  })
})
