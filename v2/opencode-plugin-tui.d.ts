/**
 * Ambient types for the host-provided `@opencode/plugin/tui` module.
 *
 * The deployed opencode-v2 binary provides this module at runtime through the
 * OpenTUI runtime-module map (`ensureRuntimePluginSupport({ additional:
 * "@opencode/plugin/tui": { Plugin, PluginContextProvider, usePlugin } })`), so
 * no real `@opencode/plugin` package exists on disk. This declaration mirrors
 * the public V2 surface used by this port, keeping it typecheckable standalone.
 *
 * Ground truth: packages/plugin/src/tui/{plugin,context,index}.ts and
 * packages/schema/src/session-event.ts in /home/lkonga/codes/opencode-v2-scrollfix.
 */

declare module "@opencode/plugin/tui" {
  export type Cleanup = () => Promise<void> | void

  export type Route =
    | { readonly type: "home" }
    | { readonly type: "session"; readonly sessionID: string }
    | {
        readonly type: "plugin"
        readonly id: string
        readonly name: string
        readonly data?: Record<string, any>
      }

  /** V2 `session.renamed` event payload (carries the new title). */
  export interface SessionRenamedEvent {
    readonly type: "session.renamed"
    readonly data: { readonly sessionID: string; readonly title: string }
  }

  /** V2 `session.created` event payload (title may not be assigned yet). */
  export interface SessionCreatedEvent {
    readonly type: "session.created"
    readonly data: { readonly sessionID: string; readonly title?: string }
  }

  export interface Data {
    on(type: "session.renamed", handler: (event: SessionRenamedEvent) => void): () => void
    on(type: "session.created", handler: (event: SessionCreatedEvent) => void): () => void
    on(type: string, handler: (event: { readonly type: string; readonly data: any }) => void): () => void
    readonly session: {
      get(sessionID: string): { readonly title?: string } | undefined
    }
  }

  export type ToastVariant = "info" | "success" | "warning" | "error"

  export interface ToastOptions {
    readonly title?: string
    readonly message: string
    readonly variant?: ToastVariant
    readonly duration?: number
  }

  export interface Toast {
    show(options: ToastOptions): void
  }

  export interface KeymapCommand {
    readonly id?: string
    readonly title?: string
    readonly description?: string
    readonly group?: string
    readonly enabled?: boolean | (() => boolean)
    readonly bind?: false | string
    readonly palette?: true
    readonly slash?: { readonly name: string; readonly aliases?: readonly string[]; readonly arguments?: true }
    readonly suggested?: boolean | (() => boolean)
    readonly run: (input?: string, event?: unknown) => void | false | Promise<void>
  }

  export interface KeymapLayer {
    readonly mode?: string
    readonly enabled?: boolean | (() => boolean)
    readonly target?: () => unknown
    readonly priority?: number
    readonly commands?: readonly KeymapCommand[]
    readonly bindings?: readonly string[]
  }

  export interface Keymap {
    layer(input: () => KeymapLayer): void
    dispatch(id: string, input?: string): void
  }

  export type SlotPath =
    | "app"
    | "home.footer"
    | "prompt.footer"
    | "prompt.footer.status"
    | "prompt.footer.file"
    | "session.composer.top"
    | "sidebar.content"
    | "sidebar.footer"

  export type SlotClaim<Path extends SlotPath = SlotPath> = Path extends SlotPath
    ? { readonly render: (input: Record<string, never>) => unknown } & (
        | { readonly prepend: Path }
        | { readonly append: Path }
        | { readonly before: Path }
        | { readonly after: Path }
        | { readonly replace: Path }
      )
    : never

  export interface UI {
    readonly toast: Toast
    readonly router: {
      register(page: unknown): () => void
      navigate(destination: unknown): void
      current(): Route
    }
    readonly slot: (claim: SlotClaim) => () => void
  }

  export interface Context {
    readonly options: Readonly<Record<string, any>>
    readonly keymap: Keymap
    readonly ui: UI
    readonly data: Data
    readonly theme: unknown
  }

  export type Definition = {
    readonly id: string
    readonly setup: (context: Context) => Promise<Cleanup | void> | Cleanup | void
  }

  export const Plugin: {
    define<D extends Definition>(plugin: D): D
  }

  export function PluginContextProvider(props: { readonly value: Context }): unknown
  export function usePlugin(): Context
}
