import type { SettingsSearchEntry } from './settings-search'
import { translate } from '@/i18n/i18n'

export function getDfHisEnvironmentPaneSearchEntries(): SettingsSearchEntry[] {
  return [
    {
      title: translate('auto.components.settings.DfHisEnvironmentPane.searchTitle', 'DFHIS setup'),
      description: translate(
        'auto.components.settings.DfHisEnvironmentPane.searchDescription',
        'Check GitLab access, Yunxiao MCP, HIS MCP, local HIS paths, and the DFHIS workflow pack.'
      ),
      keywords: [
        translate('auto.components.settings.DfHisEnvironmentPane.searchKeywordDfHis', 'dfhis'),
        translate('auto.components.settings.DfHisEnvironmentPane.searchKeywordYgt', 'ygt'),
        translate('auto.components.settings.DfHisEnvironmentPane.searchKeywordGitLab', 'gitlab'),
        translate('auto.components.settings.DfHisEnvironmentPane.searchKeywordGlab', 'glab'),
        translate('auto.components.settings.DfHisEnvironmentPane.searchKeywordYunxiao', 'yunxiao'),
        translate('auto.components.settings.DfHisEnvironmentPane.searchKeywordHis', 'his'),
        translate('auto.components.settings.DfHisEnvironmentPane.searchKeywordMcp', 'mcp'),
        translate(
          'auto.components.settings.DfHisEnvironmentPane.searchKeywordPrerequisites',
          'prerequisites'
        )
      ]
    }
  ]
}
