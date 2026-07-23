import type { JSX } from 'react'
import type {
  YgtEnvironmentConfigInput,
  YgtEnvironmentConfigSnapshot
} from '../../../../shared/ygt-environment-types'
import { Input } from '../ui/input'
import { SettingsBadge } from './SettingsFormControls'
import { translate } from '@/i18n/i18n'

export type YgtEnvironmentConfigFormState = Required<YgtEnvironmentConfigInput>

export function createEmptyYgtEnvironmentConfigForm(): YgtEnvironmentConfigFormState {
  return {
    gitlabHost: '',
    gitlabAccessToken: '',
    yunxiaoAccessToken: '',
    yunxiaoMcpUrl: '',
    hisMcpToken: '',
    hisMcpUrl: ''
  }
}

type YgtEnvironmentConfigFormProps = {
  value: YgtEnvironmentConfigFormState
  snapshot: YgtEnvironmentConfigSnapshot | null
  disabled: boolean
  onChange: (field: keyof YgtEnvironmentConfigFormState, value: string) => void
}

function savedTokenPlaceholder(hasToken: boolean, fallback: string): string {
  return hasToken
    ? translate(
        'auto.components.settings.YgtEnvironmentPane.keepSavedToken',
        'Leave blank to keep saved token'
      )
    : fallback
}

function SavedBadge(): JSX.Element {
  return (
    <SettingsBadge tone="muted">
      {translate('auto.components.settings.YgtEnvironmentPane.saved', 'Saved')}
    </SettingsBadge>
  )
}

export function YgtEnvironmentConfigForm({
  value,
  snapshot,
  disabled,
  onChange
}: YgtEnvironmentConfigFormProps): JSX.Element {
  return (
    <div className="space-y-4 rounded-lg border border-border/50 bg-background/40 px-4 py-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">
            {translate('auto.components.settings.YgtEnvironmentPane.gitlabHost', 'GitLab host')}
          </span>
          <Input
            value={value.gitlabHost}
            onChange={(event) => onChange('gitlabHost', event.target.value)}
            placeholder={translate(
              'auto.components.settings.YgtEnvironmentPane.gitlabHostPlaceholder',
              'gitlab.df-mic.com'
            )}
            disabled={disabled}
          />
        </label>
        <label className="space-y-1.5">
          <span className="flex items-center gap-2 text-xs font-medium text-foreground">
            {translate(
              'auto.components.settings.YgtEnvironmentPane.gitlabToken',
              'GitLab access token'
            )}
            {snapshot?.hasGitlabAccessToken ? <SavedBadge /> : null}
          </span>
          <Input
            type="password"
            value={value.gitlabAccessToken}
            onChange={(event) => onChange('gitlabAccessToken', event.target.value)}
            placeholder={savedTokenPlaceholder(
              Boolean(snapshot?.hasGitlabAccessToken),
              translate(
                'auto.components.settings.YgtEnvironmentPane.gitlabTokenPlaceholder',
                'glpat-...'
              )
            )}
            disabled={disabled}
          />
        </label>
        <label className="space-y-1.5">
          <span className="flex items-center gap-2 text-xs font-medium text-foreground">
            {translate(
              'auto.components.settings.YgtEnvironmentPane.yunxiaoToken',
              'Yunxiao access token'
            )}
            {snapshot?.hasYunxiaoAccessToken ? <SavedBadge /> : null}
          </span>
          <Input
            type="password"
            value={value.yunxiaoAccessToken}
            onChange={(event) => onChange('yunxiaoAccessToken', event.target.value)}
            placeholder={savedTokenPlaceholder(
              Boolean(snapshot?.hasYunxiaoAccessToken),
              translate(
                'auto.components.settings.YgtEnvironmentPane.yunxiaoTokenPlaceholder',
                'YUNXIAO_ACCESS_TOKEN'
              )
            )}
            disabled={disabled}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">
            {translate(
              'auto.components.settings.YgtEnvironmentPane.yunxiaoMcpUrl',
              'Yunxiao MCP URL'
            )}
          </span>
          <Input
            value={value.yunxiaoMcpUrl}
            onChange={(event) => onChange('yunxiaoMcpUrl', event.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="space-y-1.5">
          <span className="flex items-center gap-2 text-xs font-medium text-foreground">
            {translate('auto.components.settings.YgtEnvironmentPane.hisToken', 'HIS MCP token')}
            {snapshot?.hasHisMcpToken ? <SavedBadge /> : null}
          </span>
          <Input
            type="password"
            value={value.hisMcpToken}
            onChange={(event) => onChange('hisMcpToken', event.target.value)}
            placeholder={savedTokenPlaceholder(
              Boolean(snapshot?.hasHisMcpToken),
              translate(
                'auto.components.settings.YgtEnvironmentPane.hisTokenPlaceholder',
                'HIS_MCP_TOKEN'
              )
            )}
            disabled={disabled}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">
            {translate('auto.components.settings.YgtEnvironmentPane.hisMcpUrl', 'HIS MCP URL')}
          </span>
          <Input
            value={value.hisMcpUrl}
            onChange={(event) => onChange('hisMcpUrl', event.target.value)}
            disabled={disabled}
          />
        </label>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {translate(
          'auto.components.settings.YgtEnvironmentPane.configStorageNote',
          'Tokens are saved only on this machine under Orca user data and are not shown after saving.'
        )}
      </p>
    </div>
  )
}
