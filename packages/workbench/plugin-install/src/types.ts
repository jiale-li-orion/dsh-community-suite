/**
 * Install vocabulary: what one completed install reports back to whichever
 * plane asked for it (an agent tool or the marketplace panel).
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
