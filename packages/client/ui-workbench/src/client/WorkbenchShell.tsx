/**
 * The workbench shell: the occupant of ui-layout's `workbench` column. Renders
 * the tab strip (one tab per registered `workbench.panel` entry, read from the
 * slot registry through the injected observable), the selected panel's body
 * through keyed dispatch, and — when a panel selected a file — the viewer chain
 * for that file with the "no preview" fallback. Pure component: everything
 * arrives through the four props shares.
 */
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorkbenchFileRef, WorkbenchPanelTab } from './contract/slots.ts'
import type { NS } from './locales.ts'
import type { createWorkbenchStore } from './stores.ts'
import css from './WorkbenchShell.module.css'

/** Registrant-private injected share for the shell. */
export interface WorkbenchShellInjected {
  hooks: {
    /** Panel tabs projected from the `workbench.panel` slot registry. */
    panels: SnapshotStore<readonly WorkbenchPanelTab[]>
  }
  /** Toggle the workbench column (the header button). */
  toggle: () => void
  /** Close the viewer chain. */
  closeFile: () => void
}

/** Full composed props: runtime owner share + render shares + store + inject + locale. */
export type WorkbenchShellProps =
  & PropsRuntime<'workbench'>
  & PropsRenderSlots<'workbench.panel' | 'workbench.viewer'>
  & PropsStore<ReturnType<typeof createWorkbenchStore>>
  & InjectFace<WorkbenchShellInjected>
  & PropsLocale<typeof NS>

/**
 * Render the workbench column.
 * @param props - the four derived shares plus the injected panel face.
 * @returns the tab strip, the selected panel body, and the viewer chain.
 */
export function WorkbenchShell({
  useStore,
  usePanels,
  renderSlot,
  renderSlotChain,
  actions,
  toggle,
  closeFile,
  t,
  collapsed,
  width,
}: WorkbenchShellProps) {
  const selected = useStore(s => s.active)
  const file: WorkbenchFileRef | null = useStore(s => s.file)
  const tabs = usePanels(list => list)
  // The selection falls back to the first registered panel, so a column opened
  // before any panel was selected still shows work rather than an empty frame.
  const active = selected !== null && tabs.some(tab => tab.id === selected) ? selected : tabs[0]?.id
  // A closed column keeps this component mounted (its selection store survives)
  // but renders nothing, so the workbench never enters the accessibility tree
  // of a page the user has not opened it on.
  if (collapsed) return null
  return (
    <div className={css.shell}>
      <header className={css.header}>
        <span className={css.title}>{t('title')}</span>
        {tabs.length > 1 && (
          <nav className={css.tabs} aria-label={t('title')}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                className={css.tab}
                data-active={tab.id === active || undefined}
                onClick={() => { actions.select(tab.id) }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}
        <button type="button" className={css.close} title={t('toggle.close')} onClick={toggle}>
          ×
        </button>
      </header>
      <div className={css.body}>
        {active === undefined
          ? (
            <div className={css.empty}>
              <p className={css.emptyTitle}>{t('empty.title')}</p>
              <p className={css.emptyHint}>{t('empty.hint')}</p>
            </div>
          )
          : renderSlot('workbench.panel', { width }, { only: active })}
      </div>
      {file !== null && (
        <section className={css.viewer} aria-label={file.name}>
          <header className={css.viewerHeader}>
            <span className={css.viewerName} title={file.path}>{file.name}</span>
            <button type="button" className={css.close} title={t('viewer.close')} onClick={closeFile}>
              ×
            </button>
          </header>
          <div className={css.viewerBody}>
            {renderSlotChain('workbench.viewer', file, {
              fallback: <div className={css.notice}>{t('viewer.unsupported')}</div>,
            })}
          </div>
        </section>
      )}
    </div>
  )
}
