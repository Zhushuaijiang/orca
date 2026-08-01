type NoopChannel = {
  readonly hasSubscribers: false
  publish: () => void
  subscribe: () => void
  unsubscribe: () => void
  bindStore: <T>(store: T) => T
  unbindStore: () => void
  runStores: <T, Args extends unknown[]>(
    context: unknown,
    fn: (...args: Args) => T,
    thisArg?: unknown,
    ...args: Args
  ) => T
}

const noopChannel: NoopChannel = {
  hasSubscribers: false,
  publish: () => undefined,
  subscribe: () => undefined,
  unsubscribe: () => undefined,
  bindStore: (store) => store,
  unbindStore: () => undefined,
  runStores: (_context, fn, thisArg, ...args) => fn.apply(thisArg, args)
}

export function channel(): NoopChannel {
  return noopChannel
}

export function tracingChannel(): NoopChannel {
  return noopChannel
}
