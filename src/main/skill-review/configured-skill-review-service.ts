import type { GlobalSettings } from '../../shared/global-settings-types'
import { startSkillReviewService } from './skill-review-service'

export function startConfiguredSkillReviewService(
  getSettings: () => GlobalSettings | undefined
): void {
  startSkillReviewService({
    getSettings,
    isEnabled: () => getSettings()?.skillReviewEnabled !== false
  })
}
