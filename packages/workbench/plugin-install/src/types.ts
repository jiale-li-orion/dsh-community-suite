/**
 * Install vocabulary: what one completed install reports back to whichever
 * plane asked for it (an agent tool or the marketplace panel), plus the
 * appearance rows the profile exposes for switching.
 * @module @deepseek-ai/dsh-plugin-install/types
 */

/** One completed install. */
export interface PluginInstallResult {
  /** Catalog entry name the install came from. */
  name: string
  /** Validated install target that was handed to `dsh plugin add`. */
  target: string
  /** Profile the install targeted, derived from this build rather than the index. */
  profile: string
  /** Child output, empty when the installer printed nothing. */
  output: string
}

/** One switchable appearance row an installed bundle inserted. */
export interface PluginSkinRow {
  /** Loader row id the profile patch targets. */
  id: string
  /** Owning package name. */
  name: string
  /** Whether the composition currently mounts the row. */
  enabled: boolean
}

/** The result of one appearance-row switch. */
export interface PluginSkinToggle {
  /** Row id that was toggled. */
  id: string
  /** State written to the profile patch. */
  enabled: boolean
  /** Profile whose patch was rewritten. */
  profile: string
}
