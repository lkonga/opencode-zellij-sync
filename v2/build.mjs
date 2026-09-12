/**
 * Regenerates the validation artifact `v2/dist/tui.js` from `v2/tui.tsx`.
 *
 * Uses the exact Solid transform the OpenCode V2 TUI host applies to external
 * plugins: `createSolidTransformPlugin()` from `@opentui/solid/bun-plugin`,
 * which runs babel-preset-solid in `generate: "universal"` mode with
 * `moduleName: "@opentui/solid"` (see @opentui/solid/scripts/solid-transform.js).
 *
 * `@opencode/plugin/tui` (host runtime module map) and `@opentui/solid` (host
 * core module) stay external: the host rewrites both for external plugins.
 *
 * Usage:  cd v2 && bun install && bun run build
 * The V2 host loads `./tui.tsx` through the package export; `dist/tui.js` is
 * intentionally ignored and used only to prove the source build is reproducible.
 * Never hand-edit dist/ — rerun this script instead.
 */
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const result = await Bun.build({
  entrypoints: [new URL("./tui.tsx", import.meta.url).pathname],
  outdir: new URL("./dist", import.meta.url).pathname,
  target: "bun",
  format: "esm",
  external: ["@opencode/plugin/tui", "@opentui/solid"],
  plugins: [createSolidTransformPlugin()],
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

for (const output of result.outputs) console.log(`built ${output.path}`)
