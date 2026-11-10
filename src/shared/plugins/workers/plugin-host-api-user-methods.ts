import { z } from 'zod'
import { FRAMES_ONLY, spec } from './plugin-host-method-spec'

/** Desktop methods a frame may call only on a click or key press (`userActivation`), spread into
 *  PLUGIN_HOST_API. They share Orca's native dialogs, so their caps and schemas live together. */

/** Frame methods that only run on a click or key press in the frame (`userActivation`). */
export const PLUGIN_FRAME_USER_METHODS = {
  openExternal: 'shell.openExternal',
  saveAs: 'files.saveAs',
  pick: 'files.pick'
} as const

export const PLUGIN_EXTERNAL_URL_MAX_LENGTH = 8192
export const PLUGIN_EXTERNAL_URL_PROTOCOLS: readonly string[] = ['http:', 'https:', 'mailto:']
export const PLUGIN_SAVE_AS_MAX_BYTES = 64 * 1024 * 1024
export const PLUGIN_PICK_FILES_MAX_PATHS = 64
export const PLUGIN_PICK_FILE_PATH_MAX_LENGTH = 4096

const shellOpenExternalParams = z.strictObject({
  url: z
    .string()
    .min(1)
    .max(PLUGIN_EXTERNAL_URL_MAX_LENGTH)
    .refine(isPluginExternalUrl, 'url must be an http:, https: or mailto: URL')
})
/** `reason`, when not opened: the person said no, or nobody could be asked (Orca's window hidden). */
const shellOpenExternalResult = z.object({
  opened: z.boolean(),
  reason: z.enum(['cancelled', 'consent-unavailable']).optional()
})

const saveAsDataSchema = z.union([
  z.string().max(PLUGIN_SAVE_AS_MAX_BYTES),
  // Why Uint8Array too: IPC between Orca's own processes may hand bytes over as a view.
  z
    .custom<ArrayBuffer | Uint8Array>(
      (value) => value instanceof ArrayBuffer || value instanceof Uint8Array,
      'data must be a string or ArrayBuffer'
    )
    .refine((value) => value.byteLength <= PLUGIN_SAVE_AS_MAX_BYTES, 'data exceeds 64 MiB')
    // Names the type in the generated reference, which otherwise prints unrepresentable as JSON.
    .meta({ type: 'ArrayBuffer' })
])
const filesSaveAsParams = z.strictObject({
  suggestedName: z.string().min(1).max(255).optional(),
  mimeType: z.string().min(1).max(255).optional(),
  data: saveAsDataSchema
})
/** The chosen path never reaches the plugin; a cancelled dialog is a result, not an error. */
const filesSaveAsResult = z.object({ status: z.enum(['saved', 'cancelled']) })

const filesPickParams = z.strictObject({
  /** Only when asked may more than one path come back. */
  multiple: z.boolean().optional()
})
/** Absolute paths, bounded in count and length; a cancelled dialog is a result, not an error. */
const filesPickResult = z.object({
  status: z.enum(['picked', 'cancelled']),
  paths: z
    .array(z.string().min(1).max(PLUGIN_PICK_FILE_PATH_MAX_LENGTH))
    .max(PLUGIN_PICK_FILES_MAX_PATHS)
})

export function isPluginExternalUrl(url: string): boolean {
  try {
    return PLUGIN_EXTERNAL_URL_PROTOCOLS.includes(new URL(url).protocol)
  } catch {
    return false
  }
}

export const PLUGIN_USER_ACTIONS_API = {
  'shell.openExternal': spec({
    summary:
      'Opens an http:, https: or mailto: URL in the default browser. Needs a click or key press in the frame; desktop app only. Orca asks the person before an http(s) host the plugin was not allowed; `opened` is false if they cancel.',
    since: 1,
    scope: 'desktop',
    capability: null,
    userActivation: true,
    mutation: false,
    surfaces: FRAMES_ONLY,
    params: shellOpenExternalParams,
    result: shellOpenExternalResult
  }),
  'files.saveAs': spec({
    summary:
      "Offers data (a string or ArrayBuffer, up to 64 MiB) in Orca's save dialog; the plugin never learns the path. Needs a click or key press in the frame; desktop app only.",
    since: 1,
    scope: 'desktop',
    capability: null,
    userActivation: true,
    mutation: true,
    surfaces: FRAMES_ONLY,
    params: filesSaveAsParams,
    result: filesSaveAsResult
  }),
  'files.pick': spec({
    summary:
      'Opens Orca\'s native file chooser and returns the chosen absolute paths (up to 64, files only; pass `multiple: true` for more than one). Needs a click or key press in the frame; desktop app only; cancelling is `{ status: "cancelled", paths: [] }`, not an error.',
    since: 5,
    scope: 'desktop',
    capability: null,
    userActivation: true,
    mutation: false,
    surfaces: FRAMES_ONLY,
    params: filesPickParams,
    result: filesPickResult
  })
}
