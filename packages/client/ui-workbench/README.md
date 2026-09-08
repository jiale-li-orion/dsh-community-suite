# @deepseek-ai/dsh-client-ui-workbench

English | [中文](README.zh.md)

The workbench column: the occupant of ui-layout's optional `workbench` slot, and the panel seat other plugins contribute into. The shell renders a tab strip (one tab per registered panel, ordered by the registration `order`) and dispatches exactly the selected panel through the keyed `workbench.panel` slot, so a panel component mounts only while it is selected. With no panel registered the column shows an empty state; with the column closed by the user it renders nothing and keeps its subtree mounted.

## Contributing a panel

A panel plugin registers into the declared seat through the ordinary slot API — there is no separate registry to call:

A panel plugin registers into the declared seat through the ordinary slot API — there is no separate registry to call. The registration carries the tab identity:

- `id` — the panel id the shell dispatches by (required; an entry without one is ignored by the tab projection).
- `order` — ascending tab order; ties keep registration order.
- `label` — a string or thunk, resolved through the registrant's own locale at read time.
- `locale` — optional; puts the typed `t` seat on the component.

The component receives the four standard shares plus the panel owner share `{ width }` — the resolved column width, so a panel can adapt to a narrow column. The registration is an effect: disposing the registrant's fiber removes the tab and the panel with it.

The component receives the four standard shares plus the panel owner share `{ width }` — the resolved column width, so a panel can adapt to a narrow column. The registration is an effect: disposing the registrant's fiber removes the tab and the panel with it.

## Column transitions (`ctx.workbench`)

`ctx.workbench` is the cross-plugin transition face: `open(panelId?)` selects a panel and opens the column, `close()` closes it, and `toggle()` flips it. Column geometry itself belongs to `ctx.layout` (`openWorkbench`/`closeWorkbench`/`toggleWorkbench`); the workbench face adds only the selection write, so commands and header buttons can open a specific panel without touching the layout store.

The session-header toggle (`conversation.session.header.utilities`, id `workbench-toggle`) is the built-in entry point. It carries no live column state: the shell header owns close, and the layout face owns the transition.

## Model Experience

None, as the workbench manages browser viewing state; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Panels are root-scoped** — a panel survives session switches and reads the current session through the standard `useSessions` hook; a per-session workbench would need a session-scoped seat instead.
- **One panel is visible at a time** — the shell dispatches a single selected panel; side-by-side panes and drag-to-reorder tabs are deferred until a consumer needs them.
- **No persisted panel selection** — the selected panel resets on reload, like the column geometry itself (ui-layout's panel store is transient).
