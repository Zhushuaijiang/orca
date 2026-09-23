import { describe, expect, it } from 'vitest'
import { isTransientWslServiceFailure } from './wsl-service-failure'

describe('isTransientWslServiceFailure', () => {
  it('matches the Chinese console text from the screenshot', () => {
    expect(
      isTransientWslServiceFailure('灾难性故障\r\n错误代码: Wsl/Service/E_UNEXPECTED\r\n')
    ).toBe(true)
  })

  it('matches the English sentence and a UTF-16 code with NULs stripped', () => {
    expect(isTransientWslServiceFailure('Catastrophic failure (E_UNEXPECTED)')).toBe(true)
    expect(
      isTransientWslServiceFailure(
        'W\u0000s\u0000l\u0000/\u0000S\u0000e\u0000r\u0000v\u0000i\u0000c\u0000e\u0000/\u0000E\u0000_\u0000U\u0000N\u0000E\u0000X\u0000P\u0000E\u0000C\u0000T\u0000E\u0000D\u0000'
      )
    ).toBe(true)
  })

  it('does not treat a normal shell or another WSL error as this failure', () => {
    expect(isTransientWslServiceFailure('user@host:~$ ')).toBe(false)
    expect(isTransientWslServiceFailure('Error code: Wsl/Service/WSL_E_DISTRO_NOT_FOUND')).toBe(
      false
    )
  })
})
