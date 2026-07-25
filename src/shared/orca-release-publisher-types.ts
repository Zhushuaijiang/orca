export type OrcaReleaseArtifactStatus = 'ready' | 'missing' | 'version-mismatch' | 'unknown'

export type OrcaReleaseArtifact = {
  path: string
  kind: 'mac-app' | 'windows-exe'
  status: OrcaReleaseArtifactStatus
  version?: string
  size?: number
  sha256?: string
  mtimeMs?: number
  detail?: string
}

export type OrcaReleasePublisherStatus = {
  repoRoot: string
  version: string
  branch: string
  headSha: string
  isDirty: boolean
  checkedAt: string
  macCandidates: OrcaReleaseArtifact[]
  windowsCandidates: OrcaReleaseArtifact[]
  selectedMacAppPath?: string
  selectedWindowsExePath?: string
  remoteLatest?: {
    version?: string
    publishedAt?: string
    macSha256?: string
    windowsSha256?: string
  }
  warnings: string[]
}

export type OrcaReleasePublisherPublishArgs = {
  repoRoot?: string
  macAppPath: string
  windowsExePath: string
  remote?: string
  remoteDir?: string
  sshPassword?: string
  notes?: string
  cleanOldReleases?: boolean
  cleanLocalOldReleases?: boolean
}

export type OrcaReleasePublisherPublishResult = {
  version: string
  macosUrl: string
  windowsUrl: string
  output: string
  status: OrcaReleasePublisherStatus
}
