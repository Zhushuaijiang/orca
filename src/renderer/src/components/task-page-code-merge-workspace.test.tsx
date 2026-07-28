// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TooltipProvider } from '@/components/ui/tooltip'
import { TaskPageCodeMergeWorkspace } from './task-page-code-merge-workspace'

const pickAttachment = vi.fn<() => Promise<string | null>>()

beforeEach(() => {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      shell: {
        pickAttachment
      }
    }
  })
  pickAttachment.mockReset()
})

afterEach(cleanup)

function renderWorkspace(onOpenCodeMergeComposer = vi.fn()): ReturnType<typeof render> {
  return render(
    <TooltipProvider>
      <TaskPageCodeMergeWorkspace onOpenCodeMergeComposer={onOpenCodeMergeComposer} />
    </TooltipProvider>
  )
}

describe('TaskPageCodeMergeWorkspace', () => {
  it('imports an Excel path without opening the workspace composer', async () => {
    const user = userEvent.setup()
    const onOpenCodeMergeComposer = vi.fn()
    pickAttachment.mockResolvedValue('/tmp/钉钉文档_合并清单_2026-07-27.xlsx')

    renderWorkspace(onOpenCodeMergeComposer)

    expect(screen.getAllByText('未导入 Excel 清单').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '预检' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '导入 Excel' }))

    expect(pickAttachment).toHaveBeenCalledTimes(1)
    expect(onOpenCodeMergeComposer).not.toHaveBeenCalled()
    expect(screen.getAllByText('钉钉文档_合并清单_2026-07-27.xlsx').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '预检' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '预检' }))
    expect(onOpenCodeMergeComposer).toHaveBeenCalledWith(
      'preflight',
      '/tmp/钉钉文档_合并清单_2026-07-27.xlsx'
    )
  })
})
