/**
 * Install-target validation. The catalog carries a prebuilt command, but the
 * command itself is never executed: the provider extracts its target and this
 * module decides whether that target may be handed to `dsh plugin add`. The
 * rules are deliberately narrower than npm's grammar — an npm specifier or a
 * `github:owner/repo` reference with an optional commit-ish or pnpm
 * `#path:/<subpath>` fragment, no `..`, no shell metacharacter — because the
 * target is the one field an attacker could try to widen.
 * @module @deepseek-ai/dsh-plugin-catalog-tools/install-target
 */

/** The only command shape the catalog index may emit. */
const INSTALL_COMMAND = /^dsh plugin(?: --profile [\w.-]+)? add (\S+)$/

/** A bare npm package specifier, optionally pinned or ranged. */
const NPM_SPEC = /^(?:@[a-z0-9-_.]+\/)?[a-z0-9-_.]+(?:@[0-9a-z-_.^~><=+]+)?$/i

/** A GitHub shorthand: owner/repo, then an optional commit-ish or `#path:/<subpath>` fragment. */
const GITHUB_SPEC = /^github:[a-z0-9-_.]+\/[a-z0-9-_.]+(?:#(?:path:\/?)?[a-z0-9-_.]+(?:\/[a-z0-9-_.]+)*)?$/i

/** Characters that only matter to a shell; no shell is involved, so their presence is refused outright. */
const SHELL_METACHARACTERS = /[;&|<>$`\\'"\n\r\t*?[\]{}()!]/

/** Refusal raised when an install command or target is not acceptable. */
export class PluginInstallTargetError extends Error {
  /** Stable diagnostic code. */
  readonly code = 'PLUGIN_INSTALL_TARGET_INVALID'

  /**
   * @param message - why the target was refused.
   */
  constructor(message: string) {
    super(message)
    this.name = 'PluginInstallTargetError'
  }
}

/**
 * Extract and validate the install target from one catalog command.
 * @param install - the index's prebuilt install command, verbatim.
 * @returns the validated target, ready for `dsh plugin add`.
 * @throws PluginInstallTargetError when the command or target is unacceptable.
 */
export function parseInstallTarget(install: string): string {
  const match = INSTALL_COMMAND.exec(install.trim())
  const target = match?.[1]
  if (target === undefined) {
    throw new PluginInstallTargetError(`catalog install command ${JSON.stringify(install)} is not "dsh plugin [--profile <name>] add <target>"`)
  }
  if (target.includes('..')) {
    throw new PluginInstallTargetError(`install target ${JSON.stringify(target)} contains a parent-directory segment`)
  }
  if (SHELL_METACHARACTERS.test(target)) {
    throw new PluginInstallTargetError(`install target ${JSON.stringify(target)} contains a shell metacharacter`)
  }
  if (!NPM_SPEC.test(target) && !GITHUB_SPEC.test(target)) {
    throw new PluginInstallTargetError(
      `install target ${JSON.stringify(target)} is neither an npm specifier nor a `
      + 'github:owner/repo reference with an optional #<ref> or #path:/<subpath> fragment',
    )
  }
  return target
}
