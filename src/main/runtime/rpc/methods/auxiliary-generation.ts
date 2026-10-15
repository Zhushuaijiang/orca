import {
  AuxiliaryGenerate,
  AuxiliaryCancel,
  AuxiliaryRoute,
  AuxiliaryHistory,
  AuxiliaryAuto,
  AuxiliaryResolveLaunch
} from '../../../../shared/rpc-contract/auxiliary-params'
import { defineMethod } from '../core'

export const AUXILIARY_GENERATION_METHODS = [
  defineMethod({
    name: 'auxiliary.resolveLaunch',
    params: AuxiliaryResolveLaunch,
    handler: (params, { runtime }) =>
      runtime.resolveRuntimeAuxiliaryLaunch(
        params.worktree,
        params.task,
        params.primaryAgent,
        params.agentOverride
      )
  }),
  defineMethod({
    name: 'auxiliary.auto',
    params: AuxiliaryAuto,
    handler: (params, { runtime }) =>
      runtime.runRuntimeAuxiliaryAuto(
        params.worktree,
        params.prompt,
        params.primaryAgent,
        params.depth,
        params.images
      )
  }),
  defineMethod({
    name: 'auxiliary.route',
    params: AuxiliaryRoute,
    handler: (params, { runtime }) =>
      runtime.routeRuntimeAuxiliaryTask(
        params.worktree,
        params.prompt,
        params.primaryAgent,
        params.depth,
        params.images
      )
  }),
  defineMethod({
    name: 'auxiliary.history',
    params: AuxiliaryHistory,
    handler: (params, { runtime }) => runtime.listRuntimeAuxiliaryRoutes(params.worktree)
  }),
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
