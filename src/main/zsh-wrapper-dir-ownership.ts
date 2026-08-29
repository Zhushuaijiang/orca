/**
 * Decides which inherited ZDOTDIR Orca may treat as the user's real zsh config
 * dir, on the Node side of the launch.
 *
 * Why: Orca used to recognise only its OWN wrapper path shape (a path ending in
 * shell-ready/zsh). Launched from any other terminal that had already
 * hijacked ZDOTDIR, Orca captured that dir as "the user's config" and re-sourced
 * it. Ownership is now established positively — a stamped marker file, or Orca's
 * own dir shape for wrappers written by older builds — and a dir holding no zsh
 * startup file at all is not a config dir whoever wrote it. No vendor is
 * detected by name, because that can never be complete.
 */
import { existsSync } from 'node:fs'
import { ZSH_WRAPPER_DIR_MARKER_FILE } from './shell-templates'

type EnvLike = Record<string, string | undefined>

const ZSH_STARTUP_FILES = ['.zshenv', '.zshrc', '.zprofile', '.zlogin'] as const

export function isOrcaOwnedZshWrapperDir(dir: string): boolean {
  const normalized = dir.replace(/\/+$/, '')
  if (!normalized) {
    return false
  }
  return (
    existsSync(`${normalized}/${ZSH_WRAPPER_DIR_MARKER_FILE}`) ||
    normalized.endsWith('/shell-ready/zsh')
  )
}

/** The inherited value if it is usable as the user's config dir, else null. */
function usableInheritedZdotdir(value: string | undefined): string | null {
  if (!value) {
    return null
  }
  const normalized = value.replace(/\/+$/, '')
  if (!normalized || isOrcaOwnedZshWrapperDir(normalized)) {
    return null
  }
  if (!ZSH_STARTUP_FILES.some((file) => existsSync(`${normalized}/${file}`))) {
    return null
  }
  return value
}

/**
 * The ZDOTDIR the user genuinely has, or null.
 *
 * Why null rather than a $HOME fallback: the wrapper hands this value straight
 * back to the shell, and a user with no ZDOTDIR must end up with none — not with
 * one Orca invented. `ZDOTDIR=$HOME` and an unset ZDOTDIR look identical to zsh
 * when it reads startup files, but they are different environments for
 * everything the pane goes on to launch.
 */
/**
 * The inherited value if it is usable as the user's config dir, else null.
 *
 * Why the HOME fallback only when nothing is set: zsh itself reads $HOME when
 * ZDOTDIR is unset, so a HOME that really holds zsh config is the honest
 * handback — but when a ZDOTDIR/ORCA_ORIG_ZDOTDIR is present and unusable
 * (e.g. an Orca wrapper dir), guessing HOME would resurrect a config the
 * environment deliberately did not have.
 */
export function resolveInheritedZdotdir(env: EnvLike): string | null {
  const inherited =
    usableInheritedZdotdir(env.ZDOTDIR) ?? usableInheritedZdotdir(env.ORCA_ORIG_ZDOTDIR)
  if (inherited || env.ZDOTDIR !== undefined || env.ORCA_ORIG_ZDOTDIR !== undefined) {
    return inherited
  }
  return usableInheritedZdotdir(env.HOME)
}

/** Spawn-env entry for the wrapper's ZDOTDIR handback; absent when there is none. */
export function inheritedZdotdirEnv(inherited: string | null): Record<string, string> {
  return inherited ? { ORCA_ORIG_ZDOTDIR: inherited } : {}
}
