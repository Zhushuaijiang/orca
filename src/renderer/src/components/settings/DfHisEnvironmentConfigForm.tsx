import type { JSX } from 'react'
import type {
  DfHisEnvironmentConfigInput,
  DfHisEnvironmentConfigSnapshot
} from '../../../../shared/dfhis-environment-types'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { translate } from '@/i18n/i18n'

// Why: the form edits plain string fields; hisWorkflow is handled by the workflow gate dialog.
export type DfHisEnvironmentConfigFormState = Required<
  Omit<DfHisEnvironmentConfigInput, 'hisWorkflow'>
>

export function createEmptyDfHisEnvironmentConfigForm(): DfHisEnvironmentConfigFormState {
  return {
    gitlabHost: '',
    gitlabAccessToken: '',
    yunxiaoAccessToken: '',
    yunxiaoMcpUrl: '',
    hisMcpToken: '',
    hisMcpUrl: '',
    hisCodeRoot: '',
    hisWorkflowCatalogPath: '',
    archiveWorkspacePath: '',
    hisFactCardsRoot: '',
    hisFactIndexPath: '',
    ygtWorkspaceRoot: '',
    projectIndexManifestPath: '',
    projectCodeGraphPath: '',
    projectKnowledgeIndexPath: '',
    dfhisSkillPackUrl: '',
    magicApiEnvironments: '',
    magicApiBaseUrl: '',
    magicApiUsername: '',
    magicApiPassword: '',
    magicApiVersion: '',
    magicApiSkillPackUrl: '',
    relayExecModel: '',
    relayExecApiKey: '',
    visionApiKey: '',
    skillContributionUploadToken: '',
    smtpHost: '',
    smtpPort: '',
    smtpUser: '',
    smtpPassword: '',
    smtpFromName: '',
    emailCc: ''
  }
}

type DfHisEnvironmentConfigFormProps = {
  value: DfHisEnvironmentConfigFormState
  snapshot: DfHisEnvironmentConfigSnapshot | null
  disabled: boolean
  onChange: (field: keyof DfHisEnvironmentConfigFormState, value: string) => void
  advancedSlots?: JSX.Element[]
}

export function DfHisEnvironmentConfigForm({
  value,
  disabled,
  onChange,
  advancedSlots
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
      </div>

      <div className="space-y-3 border-t border-border/50 pt-4">
        <p className="text-xs font-medium text-foreground">
          {translate(
            'auto.components.settings.DfHisEnvironmentPane.magicApiSectionTitle',
            'MagicAPI publishing'
          )}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisEnvironmentPane.magicApiEnvironments',
                'MagicAPI sites'
              )}
            </span>
            <Textarea
              value={value.magicApiEnvironments}
              onChange={(event) => onChange('magicApiEnvironments', event.target.value)}
              placeholder={translate(
                'auto.components.settings.DfHisEnvironmentPane.magicApiEnvironmentsPlaceholder',
                'one per line: site name = http://host:port/magic/web'
              )}
              rows={3}
              disabled={disabled}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisEnvironmentPane.magicApiBaseUrl',
                'MagicAPI publish URL'
              )}
            </span>
            <Input
              value={value.magicApiBaseUrl}
              onChange={(event) => onChange('magicApiBaseUrl', event.target.value)}
              placeholder={translate(
                'auto.components.settings.DfHisEnvironmentPane.magicApiBaseUrlPlaceholder',
                'http://192.168.1.152:9059/magic/web'
              )}
              disabled={disabled}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisEnvironmentPane.magicApiVersion',
                'Verified MagicAPI version'
              )}
            </span>
            <Input
              value={value.magicApiVersion}
              onChange={(event) => onChange('magicApiVersion', event.target.value)}
              placeholder={translate(
                'auto.components.settings.DfHisEnvironmentPane.magicApiVersionPlaceholder',
                '2.2.2 / magic-script 1.9.0'
              )}
              disabled={disabled}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisEnvironmentPane.magicApiUsername',
                'MagicAPI username'
              )}
            </span>
            <Input
              value={value.magicApiUsername}
              onChange={(event) => onChange('magicApiUsername', event.target.value)}
              placeholder={translate(
                'auto.components.settings.DfHisEnvironmentPane.magicApiUsernamePlaceholder',
                'admin'
              )}
              disabled={disabled}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisEnvironmentPane.magicApiPassword',
                'MagicAPI password'
              )}
            </span>
            <Input
              value={value.magicApiPassword}
              onChange={(event) => onChange('magicApiPassword', event.target.value)}
              placeholder={translate(
                'auto.components.settings.DfHisEnvironmentPane.magicApiPasswordPlaceholder',
                'MAGIC_PASSWORD'
              )}
              disabled={disabled}
            />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisEnvironmentPane.magicApiSkillPackUrl',
                'MagicAPI skill pack URL'
              )}
            </span>
            <Input
              value={value.magicApiSkillPackUrl}
              onChange={(event) => onChange('magicApiSkillPackUrl', event.target.value)}
              placeholder={translate(
                'auto.components.settings.DfHisEnvironmentPane.magicApiSkillPackUrlPlaceholder',
                'https://.../magic-api-skill-pack.json'
              )}
              disabled={disabled}
            />
          </label>
        </div>
      </div>

      {advancedSlots && advancedSlots.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          {advancedSlots}
        </div>
      ) : null}

      <p className="text-xs leading-5 text-muted-foreground">
        {translate(
          'auto.components.settings.DfHisEnvironmentPane.configStorageNote',
          'Tokens and Yunxiao fallback paths are saved only on this machine under Orca user data.'
        )}
      </p>
    </div>
  )
}
