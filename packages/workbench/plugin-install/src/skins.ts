/**
 * Profile row enablement. A skin or theme pack is a profile bundle that inserts
 * one row into the composed tree, so switching it off means writing an
 * id-targeted `disabled` override into the profile's own patch layer — the same
 * mechanism the packs themselves document. This module owns only the file
 * arithmetic: which rows the installed appearance bundles contribute, whether
 * the patch currently disables one, and the rewrite that flips it.
 * @module @deepseek-ai/dsh-plugin-install/skins
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** A row inserted by an installed bundle the appearance panel can switch. */
export interface ProfileRow {
  /** Loader row id the patch layer targets. */
  id: string
  /** Owning package, shown to the operator. */
  name: string
  /** Whether the composition currently mounts the row. */
  enabled: boolean
}

/** The profile's patch layer file name. */
const PATCH_FILE = 'cordis.patch.yml'

/** One `insert` entry's id, and the package whose patch carried it. */
const INSERTED_ID = /^[ \t]*-[ \t]*id:[ \t]*([^\s#'"]+)[ \t]*$/gm

/** Which installed bundles count as appearance packs. */
const APPEARANCE_PACKAGE = /skin|theme|appearance|wallpaper/i

/**
 * The profile directory under this deployment's DSH home.
 * @param profile - profile name.
 * @returns the profile directory path.
 */
export function profileDirectory(profile: string): string {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'profiles', profile)
}

/** Read one JSON file, or undefined when it is absent or unparsable. */
function readJson(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  } catch {
    return undefined
  }
}

/**
 * Row ids the profile's appearance bundles insert, in bundle order.
 * @param directory - the profile directory.
 * @param appearanceOnly - whether to skip bundles that are not appearance packs.
 * @returns one entry per inserted appearance row.
 */
export function insertedRows(directory: string, appearanceOnly = true): readonly { id: string; name: string }[] {
  const manifest = readJson(join(directory, 'package.json'))
  const profile = manifest?.['dsh'] as { profile?: { bundles?: unknown } } | undefined
  const bundles = profile?.profile?.bundles
  if (!Array.isArray(bundles)) return []
  const rows: { id: string; name: string }[] = []
  for (const bundle of bundles) {
    if (typeof bundle !== 'string') continue
    if (appearanceOnly && !APPEARANCE_PACKAGE.test(bundle)) continue
    const installed = readJson(join(directory, 'node_modules', bundle, 'package.json'))
    const declared = (installed?.['dsh'] as { bundle?: { patch?: unknown } } | undefined)?.bundle?.patch
    if (typeof declared !== 'string') continue
    const patchPath = join(directory, 'node_modules', bundle, declared)
    if (!existsSync(patchPath)) continue
    for (const [, id] of readFileSync(patchPath, 'utf8').matchAll(INSERTED_ID)) {
      // The pattern's capture group is mandatory, so a match always carries one.
      rows.push({ id: id as string, name: bundle })
    }
  }
  return rows
}

/**
 * Whether the profile patch disables one row.
 * @param patch - the profile patch source.
 * @param rowId - the row id.
 * @returns true when an id-targeted entry turns the row off.
 */
export function isDisabled(patch: string, rowId: string): boolean {
  const block = blockFor(patch, rowId)
  return block !== undefined && /^[ \t]*disabled:[ \t]*true[ \t]*$/m.test(block)
}

/** The patch block targeting one row, when the layer carries one. */
function blockFor(patch: string, rowId: string): string | undefined {
  const escaped = rowId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^- id:[ \\t]*${escaped}[ \\t]*\\n(?:[ \\t]+.*\\n|\\n)*`, 'm').exec(patch)?.[0]
}

/**
 * Rewrite the profile patch so one row is enabled or disabled.
 * @param patch - the current patch source.
 * @param rowId - the row id to target.
 * @param enabled - false writes `disabled: true`; true removes the whole
 *   id-targeted block, leaving the row exactly as its bundle declared it.
 * @returns the patch source to write.
 */
export function withRowEnabled(patch: string, rowId: string, enabled: boolean): string {
  const block = blockFor(patch, rowId)
  const replacement = enabled ? '' : `- id: ${rowId}\n  disabled: true\n`
  if (block !== undefined) return patch.replace(block, replacement)
  if (enabled) return patch
  const separator = patch === '' || patch.endsWith('\n\n') ? '' : patch.endsWith('\n') ? '\n' : '\n\n'
  return `${patch}${separator}${replacement}`
}

/**
 * The appearance rows this profile can switch.
 * @param directory - the profile directory.
 * @returns one entry per inserted row, with its current enablement.
 */
export function listRows(directory: string): readonly ProfileRow[] {
  const patchPath = join(directory, PATCH_FILE)
  const patch = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
  return insertedRows(directory).map(row => ({ ...row, enabled: !isDisabled(patch, row.id) }))
}

/**
 * Enable or disable one appearance row by rewriting the profile patch.
 * @param directory - the profile directory.
 * @param rowId - the row id to target.
 * @param enabled - the state to write.
 * @throws Error when the profile declares no such row.
 */
export function setRowEnabled(directory: string, rowId: string, enabled: boolean): void {
  if (!insertedRows(directory).some(row => row.id === rowId)) {
    throw new Error(`profile ${JSON.stringify(directory)} has no appearance row ${JSON.stringify(rowId)}`)
  }
  const patchPath = join(directory, PATCH_FILE)
  const patch = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
  writeFileSync(patchPath, withRowEnabled(patch, rowId, enabled))
}
