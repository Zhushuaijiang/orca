import type {
  YunxiaoCreateRequirementArgs,
  YunxiaoRequirementPriority
} from '../../shared/yunxiao-types'

export const DEFAULT_YUNXIAO_ORGANIZATION_ID = '64cc7343a0c93ee7446892d5'
export const DEFAULT_YUNXIAO_PROJECT_ID = 'ef1714938822a5e4090b6229c7'
export const DEFAULT_YUNXIAO_REQUIREMENT_TYPE_ID = '9uy29901re573f561d69jn40'

export const YUNXIAO_BUSINESS_PRIORITY_FIELD_ID = '4afb6f4771efa28d2e6f89806c'
export const YUNXIAO_SYSTEM_FIELD_ID = '1f117933bef88732ddf6e1d019'
export const YUNXIAO_CUSTOMER_FIELD_ID = '4ef2a275c171ce2ecfcf444b47'

export const DEFAULT_YUNXIAO_PRIORITY: YunxiaoRequirementPriority = 'low'
export const DEFAULT_YUNXIAO_BUSINESS_PRIORITY = 'C类（评估处理）'
export const DEFAULT_YUNXIAO_SYSTEM = '其他'
export const DEFAULT_YUNXIAO_CUSTOMER = '东昉'

const YUNXIAO_PRIORITY_IDS = {
  urgent: 'f587cab4bc68fc9e36eafd4b01',
  high: '34361fd4d4edaa897262903544',
  medium: 'fe4d1a75ebc85b755bc3c40dff',
  low: '7897d0745014ee1db6db45989b'
} satisfies Record<NonNullable<YunxiaoCreateRequirementArgs['priority']>, string>

export function getCustomFieldValues(
  args: Pick<YunxiaoCreateRequirementArgs, 'priority' | 'businessPriority' | 'system' | 'customer'>
): Record<string, string> {
  const priority = args.priority ?? DEFAULT_YUNXIAO_PRIORITY
  return {
    priority: YUNXIAO_PRIORITY_IDS[priority],
    [YUNXIAO_BUSINESS_PRIORITY_FIELD_ID]:
      args.businessPriority?.trim() || DEFAULT_YUNXIAO_BUSINESS_PRIORITY,
    [YUNXIAO_SYSTEM_FIELD_ID]: args.system?.trim() || DEFAULT_YUNXIAO_SYSTEM,
    [YUNXIAO_CUSTOMER_FIELD_ID]: args.customer?.trim() || DEFAULT_YUNXIAO_CUSTOMER
  }
}
