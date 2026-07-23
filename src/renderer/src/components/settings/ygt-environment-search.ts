import type { SettingsSearchEntry } from './settings-search'
import { translate } from '@/i18n/i18n'

export function getYgtEnvironmentPaneSearchEntries(): SettingsSearchEntry[] {
  return [
    {
      title: translate('auto.components.settings.YgtEnvironmentPane.searchTitle', 'YGT setup'),
      description: translate(
        'auto.components.settings.YgtEnvironmentPane.searchDescription',
        'Check GitLab access, Yunxiao MCP, HIS MCP, and the YGT skill.'
      ),
      keywords: [
        translate('auto.components.settings.YgtEnvironmentPane.searchKeywordYgt', 'ygt'),
        translate('auto.components.settings.YgtEnvironmentPane.searchKeywordGitLab', 'gitlab'),
        translate('auto.components.settings.YgtEnvironmentPane.searchKeywordGlab', 'glab'),
        translate('auto.components.settings.YgtEnvironmentPane.searchKeywordYunxiao', 'yunxiao'),
        translate('auto.components.settings.YgtEnvironmentPane.searchKeywordHis', 'his'),
        translate('auto.components.settings.YgtEnvironmentPane.searchKeywordMcp', 'mcp'),
        translate(
          'auto.components.settings.YgtEnvironmentPane.searchKeywordPrerequisites',
          'prerequisites'
        )
      ]
    }
  ]
}
