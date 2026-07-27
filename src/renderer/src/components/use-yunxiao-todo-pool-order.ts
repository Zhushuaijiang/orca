import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'

import { translate } from '@/i18n/i18n'
import type { YunxiaoTodoPoolItem } from '../../../shared/types'

export function useYunxiaoTodoPoolOrder(
  setTodoPool: Dispatch<SetStateAction<YunxiaoTodoPoolItem[]>>
): (id: string, poolOrder: number) => Promise<void> {
  return async (id: string, poolOrder: number): Promise<void> => {
    try {
      const updated = await window.api.yunxiao.updateTodoPoolItem({
        id,
        updates: { poolOrder }
      })
      if (!updated) {
        toast.error(
          translate(
            'auto.components.TaskPage.yunxiaoTodoPoolUpdateMissing',
            'Todo pool item was not found.'
          )
        )
        return
      }
      setTodoPool(await window.api.yunxiao.listTodoPool())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }
}
