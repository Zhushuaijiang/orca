import { callOfficialYunxiaoTool } from '../yunxiao/client'
import { getOfficialYunxiaoConnection } from '../yunxiao/mcp-connections'
import { tryParseJson, valueFromPath } from '../yunxiao/work-item-result-extraction'

export type ContributorIdentity = {
  yunxiaoUserId: string
  name: string
  organization: string
}

const IDENTITY_TIMEOUT_MS = 60_000

const USER_ID_PATHS = [['userId'], ['id'], ['user', 'userId'], ['user', 'id']]
const NAME_PATHS = [['name'], ['userName'], ['realName'], ['user', 'name']]
const ORGANIZATION_PATHS = [
  ['organization'],
  ['organizationName'],
  ['orgName'],
  ['lastOrganization'],
  ['organization', 'name']
]

// Why: Yunxiao account names are often opaque dingtalk ids (dt_xxx); the org
// member record carries the real name the team recognizes.
async function enrichWithOrganizationMemberName(
  identity: ContributorIdentity
): Promise<ContributorIdentity> {
  if (!identity.yunxiaoUserId || !identity.organization) {
    return identity
  }
  try {
    const result = await callOfficialYunxiaoTool(
      'get_organization_member_info_by_user_id',
      { organizationId: identity.organization, userId: identity.yunxiaoUserId },
      IDENTITY_TIMEOUT_MS
    )
    const parsed = tryParseJson(result.text)
    const memberName = valueFromPath(parsed, ['name'])
    return memberName ? { ...identity, name: memberName } : identity
  } catch {
    return identity
  }
}

export function parseContributorIdentityText(text: string): ContributorIdentity | null {
  const parsed = tryParseJson(text)
  const yunxiaoUserId = USER_ID_PATHS.map((p) => valueFromPath(parsed, p)).find(Boolean)
  if (!yunxiaoUserId) {
    return null
  }
  return {
    yunxiaoUserId,
    name: NAME_PATHS.map((p) => valueFromPath(parsed, p)).find(Boolean) ?? '',
    organization: ORGANIZATION_PATHS.map((p) => valueFromPath(parsed, p)).find(Boolean) ?? ''
  }
}

let cachedIdentity: ContributorIdentity | null | undefined

export async function getContributorIdentity(): Promise<ContributorIdentity | null> {
  if (cachedIdentity !== undefined) {
    return cachedIdentity
  }
  if (!getOfficialYunxiaoConnection()) {
    cachedIdentity = null
    return cachedIdentity
  }
  try {
    const result = await callOfficialYunxiaoTool('get_current_user', {}, IDENTITY_TIMEOUT_MS)
    const identity = parseContributorIdentityText(result.text)
    cachedIdentity = identity ? await enrichWithOrganizationMemberName(identity) : null
  } catch {
    cachedIdentity = null
  }
  return cachedIdentity
}

export function resetContributorIdentityForTests(): void {
  cachedIdentity = undefined
}
