import type { GlobalSettings } from '../../shared/global-settings-types'
import { startConfiguredSkillReviewService } from '../skill-review/configured-skill-review-service'
import { startAutomaticRoutingSkillInstallation } from '../skill-packs/automatic-routing-skill-pack'

export function startConfiguredAgentSkillServices(
  getSettings: () => GlobalSettings | undefined
): void {
  startConfiguredSkillReviewService(getSettings)
  startAutomaticRoutingSkillInstallation()
}
