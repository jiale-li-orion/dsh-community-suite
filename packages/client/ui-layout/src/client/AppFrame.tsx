/**
 * Four-column shell frame, registered into the built-in 'root' slot (the web
 * shell renders only 'root'). Owns the grid tracks (sidebar | center |
 * workbench | details), the drag handles (pointer capture + rAF throttle), the
 * concession chain (columns.ts), and the child-slot render decisions: the
 * sidebar slot renders HERE with live parameters from the concession solve, and
 * the session-aware occupants render in fixed column positions; strict entries
 * gate themselves on current-session availability while session-maybe
 * entries retain identity. Pure component: everything arrives
 * through the three framework shares — zero cordis or framework imports,
 * zero self-made hooks.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'
import { computeColumns, SIDEBAR_AUTO_COLLAPSE, SIDEBAR_DEFAULT } from './columns.ts'
import type { createLayoutStore } from './stores.ts'
import css from './AppFrame.module.css'

/** Full composed props: runtime share + child-slot render share + store share. */
export type AppFrameProps =
  & PropsRuntime<'root'>
  & PropsRenderSlots<'sidebar' | 'conversation' | 'workbench' | 'details' | 'shell.overlay' | 'shell.mobile.bar'>
  & PropsStore<ReturnType<typeof createLayoutStore>>
  & PropsLocale<typeof NS>

/** Center column grid item (session-body building block). */
function CenterColumn(props: { children?: ReactNode }) {
  return <div className={css.centerCol}>{props.children}</div>
}

/** Workbench column grid item; width 0 keeps the subtree mounted (never unmount on close). */
function WorkbenchColumn(props: { children?: ReactNode }) {
  return <div className={css.workbenchCol}>{props.children}</div>
}

/** Details column grid item; width 0 keeps the subtree mounted (never unmount on close). */
function DetailsColumn(props: { children?: ReactNode }) {
  return <div className={css.detailsCol}>{props.children}</div>
}

/**
 * One drag handle: pointer capture, rAF-throttled dx reports against the drag-start origin.
 * `side` keys the hover-reveal CSS to the owning column.
 */
function DragHandle(props: { side: 'sidebar' | 'workbench' | 'details'; left: number; onStart: () => void; onDrag: (dx: number) => void; onEnd: () => void }) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const callbacks = useRef({ onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd })
  callbacks.current = { onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    origin.current = e.clientX
    latest.current = e.clientX
    callbacks.current.onStart()
    setDragging(true)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    latest.current = e.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(latest.current - origin.current)
    })
  }, [])
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
    callbacks.current.onDrag(latest.current - origin.current)
    setDragging(false)
    callbacks.current.onEnd()
  }, [])

  return (
    <div
      className={css.handle}
      style={{ left: props.left }}
      data-side={props.side}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}

/** The three-column frame (see module doc). */
export function AppFrame({
  useStore,
  useSessions,
  actions,
  renderSlot,
  t,
}: AppFrameProps) {
  const panels = useStore(s => s)
  // The narrow frame's title is the current session, not a product name: the
  // page behind it is that session's conversation.
  const sessionTitle = useSessions((s) => {
    const current = s.current
    return current === undefined ? undefined : s.byId[current]?.displayTitle
  })
  const detailsSession = useSessions((s) => {
    const current = s.current
    return current !== undefined && s.byId[current]?.blank === false ? current : undefined
  })
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState(() => window.innerWidth)

  // Choosing a session is a request to read it: a narrow frame leaves the list
  // page for the conversation, whether the choice came from this client or from
  // another one that started or switched a session.
  const currentSession = useSessions(state => state.current)
  const lastCurrentSession = useRef(currentSession)
  useEffect(() => {
    if (currentSession === undefined) return
    if (lastCurrentSession.current !== currentSession && panels.mobilePage === 'list') {
      actions.setMobilePage('conversation')
    }
    lastCurrentSession.current = currentSession
  }, [actions, currentSession, panels.mobilePage])

  const lastSession = useRef(detailsSession)
  useLayoutEffect(() => {
    if (detailsSession === undefined) return
    if (lastSession.current !== undefined && lastSession.current !== detailsSession) {
      actions.closeDetails()
    }
    lastSession.current = detailsSession
  }, [actions, detailsSession])

  // Track the frame's own box (not the window): rAF-throttled ResizeObserver.
  useEffect(() => {
    const el = frameRef.current
    /* v8 ignore next -- the ref is always attached by effect time: the frame div renders unconditionally. */
    if (el === null) return
    let raf: number | null = null
    const observer = new ResizeObserver(() => {
      raf ??= requestAnimationFrame(() => {
        raf = null
        const width = el.getBoundingClientRect().width
        if (width > 0) setViewport(width)
      })
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [])

  // Narrow viewports auto-collapse the sidebar; the store mirror keeps
  // toggleSidebar's semantics right (narrow toggles flip the manual
  // re-expand override, stores.ts). Collapsed is decided here, so the
  // solver stays breakpoint-free: a narrow re-expand passes the preference
  // (or the default when the wide preference is closed) and the center
  // absorbs the squeeze.
  const narrow = viewport < SIDEBAR_AUTO_COLLAPSE
  useEffect(() => { actions.setNarrow(narrow) }, [actions, narrow])
  const sidebarCollapsed = narrow ? !panels.narrowExpanded : panels.sidebar === 0
  const sidebarPreference = sidebarCollapsed
    ? 0
    : panels.sidebar === 0 ? SIDEBAR_DEFAULT : panels.sidebar
  const cols = computeColumns(
    viewport,
    sidebarPreference,
    panels.workbench,
    detailsSession === undefined ? 0 : panels.details,
  )
  const colsRef = useRef(cols)
  colsRef.current = cols

  // Below the breakpoint the center and the workbench cannot share the frame:
  // the rail plus CENTER_MIN plus WORKBENCH_MIN already exceeds the viewport,
  // so the concession chain derives the workbench to zero and the session-header
  // toggle stops having a visible effect on this client. Narrow therefore
  // presents the requested workbench as the single panel, with the shell's own
  // close control as the way back to the conversation.
  //
  // Presentation only: it reads the shared workbench preference and never
  // writes it, so a viewport change (rotation, window resize) cannot close,
  // open or reselect the workbench another client is showing. Only a human
  // gesture commits, and that still goes through the host service.
  const singlePanel = narrow && panels.mobilePage === 'workbench'
  // In a narrow frame the column is the workbench page or it is nothing: the
  // shared preference decides what the desktop draws, not what this page is.
  const workbenchCollapsed = narrow ? !singlePanel : cols.workbench === 0
  // A narrow frame shows no sidebar rail, so the workbench page owns the whole
  // width it is given.
  const workbenchWidth = narrow ? (singlePanel ? viewport : 0) : cols.workbench

  // The drag base is the rendered width captured at drag start (grabbing a
  // concession-clamped panel must not jump back to the stored preference);
  // it stays frozen for the whole gesture so dx deltas do not compound.
  const sidebarBase = useRef(0)
  const workbenchBase = useRef(0)
  const detailsBase = useRef(0)
  // Track-level transitions pause for the whole gesture: eased tracks would
  // detach the column edge from the pointer (AppFrame.module.css).
  const [dragging, setDragging] = useState(false)
  const onDragEnd = useCallback(() => { setDragging(false) }, [])
  const onSidebarStart = useCallback(() => { sidebarBase.current = colsRef.current.sidebar; setDragging(true) }, [])
  const onWorkbenchStart = useCallback(() => { workbenchBase.current = colsRef.current.workbench; setDragging(true) }, [])
  const onDetailsStart = useCallback(() => { detailsBase.current = colsRef.current.details; setDragging(true) }, [])
  const onSidebarDrag = useCallback((dx: number) => {
    actions.setSidebar(sidebarBase.current + dx)
  }, [actions])
  const onWorkbenchDrag = useCallback((dx: number) => {
    actions.setWorkbench(workbenchBase.current - dx)
  }, [actions])
  const onDetailsDrag = useCallback((dx: number) => {
    actions.setDetails(detailsBase.current - dx)
  }, [actions])

  if (narrow) {
    // One control, two meanings: from the conversation it opens the list, from
    // any other page it goes back. Both directions stay one tap.
    const backToConversation = panels.mobilePage !== 'conversation'
    return (
      <div
        ref={frameRef}
        className={css.frame}
        data-mobile=''
        data-mobile-page={panels.mobilePage}
        data-workbench-collapsed={workbenchCollapsed || undefined}
      >
        {/* One page at a time, and a bar that says which session this is and
            which page it can move to. The padding is the safe area: a control
            the system status bar covers is a control nobody can press. */}
        <header className={css.mobileBar}>
          <button
            type='button'
            className={css.mobileNav}
            aria-label={backToConversation ? t('mobile.back') : t('mobile.openList')}
            onClick={() => { actions.setMobilePage(backToConversation ? 'conversation' : 'list') }}
          >
            {backToConversation ? '←' : '☰'}
          </button>
          <span className={css.mobileTitle} title={sessionTitle}>{sessionTitle ?? t('mobile.untitled')}</span>
          <div className={css.mobileActions}>{renderSlot('shell.mobile.bar', {})}</div>
        </header>
        {/* Every page stays mounted: switching pages must not cost a session its
            scroll position or a panel its listing. */}
        <div className={css.mobileBody}>
          <div className={css.mobileSidebar}>{renderSlot('sidebar', { collapsed: false, width: viewport })}</div>
          <CenterColumn>{renderSlot('conversation', {})}</CenterColumn>
          <WorkbenchColumn>
            {renderSlot('workbench', { collapsed: workbenchCollapsed, width: workbenchWidth })}
          </WorkbenchColumn>
        </div>
        <div className={css.overlayLayer} data-shell-overlay>
          {renderSlot('shell.overlay', {})}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={frameRef}
      className={css.frame}
      style={{
        gridTemplateColumns: singlePanel
          ? `${cols.sidebar}px minmax(0, 1fr)`
          : `${cols.sidebar}px minmax(0, 1fr) ${cols.workbench}px ${cols.details}px`,
      }}
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      data-single-panel={singlePanel || undefined}
      data-workbench-collapsed={workbenchCollapsed || undefined}
      data-details-collapsed={cols.details === 0 || undefined}
      data-dragging={dragging || undefined}
    >
      <div className={css.sidebarCol}>
        {/* Render-site slot call with live concession output: a closed
            sidebar keeps the mounted slot at the compact-rail width, and the
            component sees its rendered state as owner params decided here
            (collapsed follows the resolved rail, so a derived auto-collapse
            renders the rail UI too). */}
        {renderSlot('sidebar', {
          collapsed: sidebarCollapsed,
          width: cols.sidebar,
        })}
      </div>
      <>
        {/* Both column occupants stay at fixed tree positions from first
            paint — no loading gate: a bare status line reads worse than
            the shell's own pending rendering. The conversation
            is session-maybe; the strict details entry naturally renders
            empty while no session is current. The workbench is an optional
            root-scoped column: with no registrant it renders nothing at zero
            width, exactly like an unoccupied details column. */}
        <CenterColumn>{renderSlot('conversation', {})}</CenterColumn>
        <WorkbenchColumn>
          {renderSlot('workbench', { collapsed: workbenchCollapsed, width: workbenchWidth })}
        </WorkbenchColumn>
        <DetailsColumn>{renderSlot('details', {})}</DetailsColumn>
      </>
      <div className={css.overlayLayer} data-shell-overlay>
        {renderSlot('shell.overlay', {})}
      </div>
      {/* The collapsed rail is fixed-width: no resize handle while closed. A
          single panel fills the remaining track, so neither of its neighbours
          has a border to drag. */}
      {!sidebarCollapsed && <DragHandle side="sidebar" left={cols.sidebar} onStart={onSidebarStart} onDrag={onSidebarDrag} onEnd={onDragEnd} />}
      {!singlePanel && cols.workbench > 0 && <DragHandle side="workbench" left={viewport - cols.details - cols.workbench} onStart={onWorkbenchStart} onDrag={onWorkbenchDrag} onEnd={onDragEnd} />}
      {!singlePanel && cols.details > 0 && <DragHandle side="details" left={viewport - cols.details} onStart={onDetailsStart} onDrag={onDetailsDrag} onEnd={onDragEnd} />}
    </div>
  )
}
