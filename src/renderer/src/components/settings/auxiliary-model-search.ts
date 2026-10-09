import { AUXILIARY_TASKS } from '../../../../shared/auxiliary-model-types'
import { translate } from '@/i18n/i18n'

export function getAuxiliaryModelSearchEntries() {
  return AUXILIARY_TASKS.map((task) => ({
    title: translate(`auxiliary.tasks.${task.id}.title`, task.title),
    description: translate(`auxiliary.tasks.${task.id}.description`, task.description),
    keywords: ['auxiliary', 'model', 'agent', '辅助模型', '任务路由'],
    targetSectionId: `auxiliary-${task.id}`
  }))
}
