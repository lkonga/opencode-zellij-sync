import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

const spawnCalls: Array<{ cmd: string; args: string[] }> = [];
let shouldThrow = false;

mock.module("child_process", () => ({
  spawn: (cmd: string, args: string[]) => {
    if (shouldThrow) throw new Error("ENOENT");
    spawnCalls.push({ cmd, args });
    return { unref: () => {} };
  },
}));

mock.module("fs", () => ({
  existsSync: (p: string) => p.includes("zellij"),
}));

const { renamePane, findZellij, ZellijNamer } = await import("./index.js");

describe("opencode-zellij-namer", () => {
  beforeEach(() => {
    spawnCalls.length = 0;
    delete process.env.ZELLIJ;
    delete process.env.ZELLIJ_SESSION_NAME;
    delete process.env.OPENCODE_ZN_DEBUG;
  });

  afterEach(() => {
    delete process.env.ZELLIJ;
    delete process.env.ZELLIJ_SESSION_NAME;
    delete process.env.OPENCODE_ZN_DEBUG;
  });

  describe("findZellij", () => {
    test("returns path when zellij binary exists", () => {
      const log = { debug: () => {}, error: () => {} };
      const result = findZellij(log as any);
      expect(result).toContain("zellij");
    });
  });

  describe("renamePane", () => {
    test("calls zellij action rename-pane with title", () => {
      const log = { debug: () => {}, error: () => {} };
      renamePane("hCaptcha pipeline", "/usr/bin/zellij", log as any);
      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].cmd).toBe("/usr/bin/zellij");
      expect(spawnCalls[0].args).toEqual(["action", "rename-pane", "hCaptcha pipeline"]);
    });

    test("uses ZELLIJ_PANE_ID when set", () => {
      process.env.ZELLIJ_PANE_ID = "42";
      const log = { debug: () => {}, error: () => {} };
      renamePane("test-title", "zellij", log as any);
      expect(spawnCalls[0].args).toEqual(["action", "rename-pane", "--pane-id", "42", "test-title"]);
      delete process.env.ZELLIJ_PANE_ID;
    });

    test("returns true on success", () => {
      const log = { debug: () => {}, error: () => {} };
      expect(renamePane("test-title", "zellij", log as any)).toBe(true);
    });

    test("returns false on spawn error", () => {
      shouldThrow = true;
      const log = { debug: () => {}, error: () => {} };
      const result = renamePane("test", "zellij", log as any);
      expect(result).toBe(false);
      shouldThrow = false;
    });
  });

  describe("ZellijNamer initial sync", () => {
    test("syncs ZELLIJ_SESSION_NAME to pane on load", async () => {
      process.env.ZELLIJ = "0";
      process.env.ZELLIJ_SESSION_NAME = "happy-wolf";
      await ZellijNamer();
      await new Promise((r) => setTimeout(r, 50));
      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].args).toEqual(["action", "rename-pane", "happy-wolf"]);
    });

    test("skips when not in zellij", async () => {
      // ZELLIJ not set
      process.env.ZELLIJ_SESSION_NAME = "happy-wolf";
      await ZellijNamer();
      await new Promise((r) => setTimeout(r, 50));
      expect(spawnCalls).toHaveLength(0);
    });

    test("skips when no ZELLIJ_SESSION_NAME", async () => {
      process.env.ZELLIJ = "0";
      // ZELLIJ_SESSION_NAME not set
      await ZellijNamer();
      await new Promise((r) => setTimeout(r, 50));
      expect(spawnCalls).toHaveLength(0);
    });
  });

  describe("ZellijNamer session.updated event", () => {
    test("syncs title from session.updated event", async () => {
      process.env.ZELLIJ = "0";
      process.env.ZELLIJ_SESSION_NAME = "happy-wolf";
      const plugin = await ZellijNamer();
      await new Promise((r) => setTimeout(r, 50));
      spawnCalls.length = 0;

      await plugin.event({ event: { type: "session.updated", title: "hCaptcha solving pipeline" } });
      await new Promise((r) => setTimeout(r, 50));
      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].args).toEqual(["action", "rename-pane", "hCaptcha solving pipeline"]);
    });

    test("skips session.updated when not in zellij", async () => {
      // ZELLIJ not set
      const plugin = await ZellijNamer();
      await plugin.event({ event: { type: "session.updated", title: "new title" } });
      await new Promise((r) => setTimeout(r, 50));
      expect(spawnCalls).toHaveLength(0);
    });

    test("skips duplicate title from session.updated", async () => {
      process.env.ZELLIJ = "0";
      process.env.ZELLIJ_SESSION_NAME = "happy-wolf";
      const plugin = await ZellijNamer();
      await new Promise((r) => setTimeout(r, 50));
      spawnCalls.length = 0;

      // Same title as initial sync
      await plugin.event({ event: { type: "session.updated", title: "happy-wolf" } });
      await new Promise((r) => setTimeout(r, 50));
      expect(spawnCalls).toHaveLength(0);
    });

    test("ignores non-session.updated events", async () => {
      process.env.ZELLIJ = "0";
      process.env.ZELLIJ_SESSION_NAME = "happy-wolf";
      const plugin = await ZellijNamer();
      await new Promise((r) => setTimeout(r, 50));
      spawnCalls.length = 0;

      await plugin.event({ event: { type: "session.idle", messages: [] } });
      await new Promise((r) => setTimeout(r, 50));
      expect(spawnCalls).toHaveLength(0);
    });

    test("handles session.updated with title in properties", async () => {
      process.env.ZELLIJ = "0";
      process.env.ZELLIJ_SESSION_NAME = "happy-wolf";
      const plugin = await ZellijNamer();
      await new Promise((r) => setTimeout(r, 50));
      spawnCalls.length = 0;

      await plugin.event({ event: { type: "session.updated", properties: { title: "via properties" } } });
      await new Promise((r) => setTimeout(r, 50));
      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].args).toEqual(["action", "rename-pane", "via properties"]);
    });

    test("handles session.updated with title in info (upstream payload)", async () => {
      process.env.ZELLIJ = "0";
      process.env.ZELLIJ_SESSION_NAME = "happy-wolf";
      const plugin = await ZellijNamer();
      await new Promise((r) => setTimeout(r, 50));
      spawnCalls.length = 0;

      await plugin.event({ event: { type: "session.updated", sessionID: "abc123", info: { title: "Fixing zellij spam", id: "abc123", slug: "abc", projectID: "p1", directory: "/home", version: "1.0" } } });
      await new Promise((r) => setTimeout(r, 50));
      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].args).toEqual(["action", "rename-pane", "Fixing zellij spam"]);
    });

    test("handles session.updated with properties.info.title (backend plugin payload)", async () => {
      process.env.ZELLIJ = "0";
      process.env.ZELLIJ_SESSION_NAME = "happy-wolf";
      const plugin = await ZellijNamer();
      await new Promise((r) => setTimeout(r, 50));
      spawnCalls.length = 0;

      await plugin.event({ event: { id: "evt1", type: "session.updated", properties: { sessionID: "abc", info: { title: "Backend plugin title" } } } });
      await new Promise((r) => setTimeout(r, 50));
      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].args).toEqual(["action", "rename-pane", "Backend plugin title"]);
    });

    test("skips session.updated with no title", async () => {
      process.env.ZELLIJ = "0";
      process.env.ZELLIJ_SESSION_NAME = "happy-wolf";
      const plugin = await ZellijNamer();
      await new Promise((r) => setTimeout(r, 50));
      spawnCalls.length = 0;

      await plugin.event({ event: { type: "session.updated" } });
      await new Promise((r) => setTimeout(r, 50));
      expect(spawnCalls).toHaveLength(0);
    });
  });

  describe("ZellijNamer multiple updates", () => {
    test("syncs title change from first to second update", async () => {
      process.env.ZELLIJ = "0";
      process.env.ZELLIJ_SESSION_NAME = "initial-name";
      const plugin = await ZellijNamer();
      await new Promise((r) => setTimeout(r, 50));
      spawnCalls.length = 0;

      await plugin.event({ event: { type: "session.updated", title: "first-retitle" } });
      await new Promise((r) => setTimeout(r, 50));
      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].args[2]).toBe("first-retitle");

      spawnCalls.length = 0;
      await plugin.event({ event: { type: "session.updated", title: "second-retitle" } });
      await new Promise((r) => setTimeout(r, 50));
      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].args[2]).toBe("second-retitle");
    });
  });
});
