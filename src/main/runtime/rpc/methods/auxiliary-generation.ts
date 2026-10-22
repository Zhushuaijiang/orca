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
    permission: 'workspace',
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
    permission: 'workspace',
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
    permission: 'workspace',
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
    permission: 'workspace',
    params: AuxiliaryHistory,
    handler: (params, { runtime }) => runtime.listRuntimeAuxiliaryRoutes(params.worktree)
  }),
  defineMethod({
    name: 'auxiliary.generate',
    permission: 'workspace',
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
    permission: 'workspace',
    params: AuxiliaryCancel,
    handler: (params, { runtime }) =>
      runtime.cancelRuntimeAuxiliaryTask(params.worktree, params.task)
  })
]
