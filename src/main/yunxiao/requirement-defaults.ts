import type { YunxiaoCreateRequirementArgs } from '../../shared/yunxiao-types'

export const DEFAULT_YUNXIAO_ORGANIZATION_ID = '64cc7343a0c93ee7446892d5'
export const DEFAULT_YUNXIAO_PROJECT_ID = 'ef1714938822a5e4090b6229c7'
export const DEFAULT_YUNXIAO_REQUIREMENT_TYPE_ID = '9uy29901re573f561d69jn40'

const DEFAULT_YUNXIAO_CUSTOM_FIELD_VALUES = {
  priority: '7897d0745014ee1db6db45989b',
  '4afb6f4771efa28d2e6f89806c': 'C类（评估处理）',
  '1f117933bef88732ddf6e1d019': '其他',
  '4ef2a275c171ce2ecfcf444b47': '东昉'
} satisfies Record<string, string>

const YUNXIAO_PRIORITY_IDS = {
  urgent: 'f587cab4bc68fc9e36eafd4b01',
  high: '34361fd4d4edaa897262903544',
  medium: 'fe4d1a75ebc85b755bc3c40dff',
  low: '7897d0745014ee1db6db45989b'
} satisfies Record<NonNullable<YunxiaoCreateRequirementArgs['priority']>, string>

export function getDefaultCustomFieldValues(
  priority: YunxiaoCreateRequirementArgs['priority']
): Record<string, string> {
  return {
    ...DEFAULT_YUNXIAO_CUSTOM_FIELD_VALUES,
    ...(priority ? { priority: YUNXIAO_PRIORITY_IDS[priority] } : {})
  }
}
