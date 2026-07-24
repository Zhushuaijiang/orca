import type { JSX } from 'react'
import type {
  DfHisEnvironmentConfigInput,
  DfHisEnvironmentConfigSnapshot
} from '../../../../shared/dfhis-environment-types'
import { Input } from '../ui/input'
import { translate } from '@/i18n/i18n'

export type DfHisEnvironmentConfigFormState = Required<DfHisEnvironmentConfigInput>

export function createEmptyDfHisEnvironmentConfigForm(): DfHisEnvironmentConfigFormState {
  return {
    gitlabHost: '',
    gitlabAccessToken: '',
    yunxiaoAccessToken: '',
    yunxiaoMcpUrl: '',
    hisMcpToken: '',
    hisMcpUrl: '',
    hisCodeRoot: '',
    archiveWorkspacePath: ''
  }
}

type DfHisEnvironmentConfigFormProps = {
  value: DfHisEnvironmentConfigFormState
  snapshot: DfHisEnvironmentConfigSnapshot | null
  disabled: boolean
  onChange: (field: keyof DfHisEnvironmentConfigFormState, value: string) => void
}

export function DfHisEnvironmentConfigForm({
  value,
  disabled,
  onChange
}: DfHisEnvironmentConfigFormProps): JSX.Element {
  return (
    <div className="space-y-4 rounded-lg border border-border/50 bg-background/40 px-4 py-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">
            {translate('auto.components.settings.DfHisEnvironmentPane.gitlabHost', 'GitLab host')}
          </span>
          <Input
            value={value.gitlabHost}
            onChange={(event) => onChange('gitlabHost', event.target.value)}
            placeholder={translate(
              'auto.components.settings.DfHisEnvironmentPane.gitlabHostPlaceholder',
              'gitlab.df-mic.com'
            )}
            disabled={disabled}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">
            {translate(
              'auto.components.settings.DfHisEnvironmentPane.gitlabToken',
              'GitLab access token'
            )}
          </span>
          <Input
            value={value.gitlabAccessToken}
            onChange={(event) => onChange('gitlabAccessToken', event.target.value)}
            placeholder={translate(
              'auto.components.settings.DfHisEnvironmentPane.gitlabTokenPlaceholder',
              'glpat-...'
            )}
            disabled={disabled}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">
            {translate(
              'auto.components.settings.DfHisEnvironmentPane.yunxiaoMcpUrl',
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
          <span className="text-xs font-medium text-foreground">
            {translate(
              'auto.components.settings.DfHisEnvironmentPane.yunxiaoToken',
              'Yunxiao access token'
            )}
          </span>
          <Input
            value={value.yunxiaoAccessToken}
            onChange={(event) => onChange('yunxiaoAccessToken', event.target.value)}
            placeholder={translate(
              'auto.components.settings.DfHisEnvironmentPane.yunxiaoTokenPlaceholder',
              'YUNXIAO_ACCESS_TOKEN'
            )}
            disabled={disabled}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">
            {translate('auto.components.settings.DfHisEnvironmentPane.hisMcpUrl', 'HIS MCP URL')}
          </span>
          <Input
            value={value.hisMcpUrl}
            onChange={(event) => onChange('hisMcpUrl', event.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">
            {translate('auto.components.settings.DfHisEnvironmentPane.hisToken', 'HIS MCP token')}
          </span>
          <Input
            value={value.hisMcpToken}
            onChange={(event) => onChange('hisMcpToken', event.target.value)}
            placeholder={translate(
              'auto.components.settings.DfHisEnvironmentPane.hisTokenPlaceholder',
              'HIS_MCP_TOKEN'
            )}
            disabled={disabled}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">
            {translate(
              'auto.components.settings.DfHisEnvironmentPane.hisCodeRoot',
              'Default code root'
            )}
          </span>
          <Input
            value={value.hisCodeRoot}
            onChange={(event) => onChange('hisCodeRoot', event.target.value)}
            placeholder={translate(
              'auto.components.settings.DfHisEnvironmentPane.hisCodeRootPlaceholder',
              '~/workspace/<project>/code'
            )}
            disabled={disabled}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">
            {translate(
              'auto.components.settings.DfHisEnvironmentPane.archiveWorkspacePath',
              'Yunxiao archive workspace'
            )}
          </span>
          <Input
            value={value.archiveWorkspacePath}
            onChange={(event) => onChange('archiveWorkspacePath', event.target.value)}
            placeholder={translate(
              'auto.components.settings.DfHisEnvironmentPane.archiveWorkspacePathPlaceholder',
              '~/workspace/yunxiao'
            )}
            disabled={disabled}
          />
        </label>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {translate(
          'auto.components.settings.DfHisEnvironmentPane.configStorageNote',
          'Tokens and Yunxiao fallback paths are saved only on this machine under Orca user data.'
        )}
      </p>
    </div>
  )
}
