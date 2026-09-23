/** wsl.exe prints this when the VM service rejects a spawn. Chinese Windows
 *  localizes the sentence and keeps the code, so match the code. */
export function isTransientWslServiceFailure(text: string): boolean {
  const normalized = text.replaceAll('\u0000', '')
  return (
    /Wsl\/Service\/E_UNEXPECTED/i.test(normalized) ||
    /catastrophic failure/i.test(normalized) ||
    normalized.includes('灾难性故障')
  )
}
