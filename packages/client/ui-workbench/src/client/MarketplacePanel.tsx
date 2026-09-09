/**
 * The marketplace panel: search the configured plugin catalog and install one
 * entry. Reads go through the host catalog service and the install button
 * calls the host install capability, so the browser never sees a command — the
 * entry's own install string stays on the host, and the click is the human's
 * own consent (the agent path is the one that adds `ctx.approval`).
 */
import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginCatalogPage, PluginCatalogQuery } from '@deepseek-ai/dsh-plugin-catalog/types'
import type { PluginInstallResult } from '@deepseek-ai/dsh-plugin-install/types'
import type { NS } from './locales.ts'
import css from './MarketplacePanel.module.css'

/** Registrant-private injected share: catalog search and install. */
export interface MarketplaceInjected {
  /**
   * Search the host catalog.
   * @param query - substring, category, and page size.
   * @returns the matching page.
   */
  search: (query: PluginCatalogQuery) => Promise<PluginCatalogPage>
  /**
   * Install one catalog entry by URL.
   * @param url - exact entry URL a search result carried.
   * @returns the completed install.
   */
  install: (url: string) => Promise<PluginInstallResult>
}

/** Full composed props for the marketplace panel. */
export type MarketplacePanelProps =
  & PropsRuntime<'workbench.panel'>
  & InjectFace<MarketplaceInjected>
  & PropsLocale<typeof NS>

/** One result row's popularity line. */
function popularity(stars: number | null, downloads: number | null, category: string): string {
  return [
    category,
    stars === null ? undefined : `${String(stars)}★`,
    downloads === null ? undefined : `${String(downloads)} downloads`,
  ].filter(part => part !== undefined).join(' · ')
}

/**
 * Render the marketplace panel.
 * @param props - owner width, injected catalog faces, and the locale seat.
 * @returns the search box, results, and the install affordance.
 */
export function MarketplacePanel({ search, install, t }: MarketplacePanelProps) {
  const [draft, setDraft] = useState('')
  const [page, setPage] = useState<PluginCatalogPage | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [pending, setPending] = useState<string | undefined>(undefined)
  const [confirming, setConfirming] = useState<string | undefined>(undefined)
  const [installed, setInstalled] = useState<PluginInstallResult | undefined>(undefined)

  const runSearch = (): void => {
    setError(undefined)
    setInstalled(undefined)
    setConfirming(undefined)
    const query = draft.trim()
    void search({ ...query === '' ? {} : { query }, limit: 20 }).then(
      (next) => { setPage(next) },
      (cause: unknown) => { setError(cause instanceof Error ? cause.message : String(cause)) },
    )
  }

  const runInstall = (url: string): void => {
    setError(undefined)
    setConfirming(undefined)
    setPending(url)
    void install(url).then(
      (result) => { setPending(undefined); setInstalled(result) },
      (cause: unknown) => {
        setPending(undefined)
        setError(cause instanceof Error ? cause.message : String(cause))
      },
    )
  }

  return (
    <div className={css.panel}>
      <form
        className={css.search}
        onSubmit={(event) => { event.preventDefault(); runSearch() }}
      >
        <input
          className={css.input}
          type="search"
          value={draft}
          placeholder={t('marketplace.placeholder')}
          aria-label={t('marketplace.search')}
          onChange={(event) => { setDraft(event.target.value) }}
        />
        <button type="submit" className={css.submit}>{t('marketplace.search')}</button>
      </form>
      <p className={css.notice}>{t('marketplace.notice')}</p>
      {error !== undefined && <div className={css.error}>{t('marketplace.error', { message: error })}</div>}
      {installed !== undefined && (
        <div className={css.installed}>{t('marketplace.installed', { name: installed.name, profile: installed.profile })}</div>
      )}
      {page !== undefined && page.entries.length === 0 && <div className={css.notice}>{t('marketplace.empty')}</div>}
      <ul className={css.list}>
        {(page?.entries ?? []).map(entry => (
          <li key={entry.url} className={css.row}>
            <div className={css.name}>{entry.name}<span className={css.owner}> ({entry.owner})</span></div>
            <div className={css.description}>{entry.description}</div>
            <div className={css.meta}>{popularity(entry.stars, entry.downloads, entry.category)}</div>
            <div className={css.actions}>
              <code className={css.command} title={entry.install}>{entry.install}</code>
              <button
                type="button"
                className={css.install}
                disabled={pending === entry.url}
                onClick={() => {
                  if (confirming === entry.url) runInstall(entry.url)
                  else setConfirming(entry.url)
                }}
              >
                {confirming === entry.url ? t('marketplace.confirm') : t('marketplace.install')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
