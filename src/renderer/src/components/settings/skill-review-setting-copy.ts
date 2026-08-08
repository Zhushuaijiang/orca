import { translate } from '@/i18n/i18n'
import { searchKeywords } from './settings-search-keywords'

const TITLE_KEY = 'auto.components.settings.skill-review-setting-copy.c7d86b9e8e'
const DESCRIPTION_KEY = 'auto.components.settings.skill-review-setting-copy.86cb0bd866'

export function getSkillReviewTitle(): string {
  return translate(TITLE_KEY, 'Auto-distill skills after agent sessions')
}

export function getSkillReviewDescription(): string {
  return translate(
    DESCRIPTION_KEY,
    'When an agent session ends, Orca runs a sandboxed background review that writes reusable lessons into the shared skill library and long-term memory. It follows the session agent and reverts anything outside the skill and memory directories.'
  )
}

export function getSkillReviewSearchKeywords(): string[] {
  return searchKeywords([
    { key: 'auto.components.settings.skill-review-setting-copy.92892a51e6', fallback: 'skill' },
    { key: 'auto.components.settings.skill-review-setting-copy.be772d6d7f', fallback: 'memory' },
    { key: 'auto.components.settings.skill-review-setting-copy.35f3db57a2', fallback: 'distill' },
    { key: 'auto.components.settings.skill-review-setting-copy.79e42a4d16', fallback: 'review' },
    { key: 'auto.components.settings.skill-review-setting-copy.fefaef908d', fallback: 'session' },
    { key: 'auto.components.settings.skill-review-setting-copy.f86a4e229d', fallback: 'lesson' }
  ])
}
