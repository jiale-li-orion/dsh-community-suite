/**
 * Which profile an install targets. The profile is a property of the running
 * composition, never of the catalog command: an installed plugin lives under
 * `$DSH_HOME/profiles/<name>/node_modules/…`, so its own module URL names the
 * profile it was installed into. A source launch (the repository's own dev
 * harness) has no such path and must declare the profile explicitly — the
 * refusal says so instead of guessing a directory to write.
 * @module @deepseek-ai/dsh-plugin-catalog-tools/profile
 */

/** One profile directory in an installed plugin's module URL. */
const INSTALLED_PROFILE = /\/profiles\/([^/]+)\/node_modules\//

/**
 * Resolve the profile an install targets.
 * @param moduleUrl - the plugin's own `import.meta.url`.
 * @param configured - the deployment's declared profile, when it set one.
 * @returns the profile name.
 * @throws when neither the module path nor the config names a profile.
 */
export function resolveProfile(moduleUrl: string, configured: string | undefined): string {
  const installed = INSTALLED_PROFILE.exec(moduleUrl)?.[1]
  if (installed !== undefined && installed !== '') return installed
  if (configured !== undefined && configured !== '') return configured
  throw new Error(
    'plugin_install cannot determine the active profile: this build is not installed under '
    + '$DSH_HOME/profiles/<name>, so set the row config key "profile" to the profile an install should target',
  )
}
