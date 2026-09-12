# V2 TUI entrypoint

OpenCode V2 loads this directory as a local TUI plugin. Its public plugin
resolver appends `/tui` to a plugin-directory URL, and Bun resolves that path
through `package.json`'s `"./tui": "./tui.tsx"` export. The source TSX file is
therefore the canonical runtime entrypoint, matching the proven
`opencode-pool-guard/v2` convention.

`bun run build` produces `dist/tui.js` only as a reproducibility and loader
validation artifact. The repository's broad `dist/` ignore intentionally keeps
that derived file untracked; runtime loading does not depend on it. Never edit
the generated file directly.

The command layer uses `mode: "global"`, because V2 otherwise defaults a layer
to `base` mode and the palette/slash command would not be discoverable from all
routes.
