import {
  AuxiliaryGenerate,
  AuxiliaryCancel
} from '../../../../shared/rpc-contract/auxiliary-params'
import { defineMethod } from '../core'

export const AUXILIARY_GENERATION_METHODS = [
  defineMethod({
    name: 'auxiliary.generate',
    params: AuxiliaryGenerate,
    handler: (params, { runtime }) =>
      runtime.generateRuntimeAuxiliaryTask(
        params.worktree,
        params.task,
        params.prompt,
        params.images,
        params.resolvedParams,
        params.primaryAgent
      )
  }),
  defineMethod({
    name: 'auxiliary.cancel',
    params: AuxiliaryCancel,
    handler: (params, { runtime }) =>
      runtime.cancelRuntimeAuxiliaryTask(params.worktree, params.task)
  })
]
