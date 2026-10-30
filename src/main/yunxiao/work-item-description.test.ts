import { describe, expect, it } from 'vitest'
import { normalizeYunxiaoWorkItemDescription } from './work-item-description'

describe('normalizeYunxiaoWorkItemDescription', () => {
  it('keeps markdown paragraph structure', () => {
    const markdown = '第一段\n\n第二段\n- 列表'
    expect(normalizeYunxiaoWorkItemDescription(markdown)).toBe(markdown)
  })

  it('turns rich text into paragraphs instead of one collapsed line', () => {
    const html = '<p>第一段</p><p>第二段<br>换行</p>'
    expect(normalizeYunxiaoWorkItemDescription(html)).toBe('第一段\n第二段\n换行')
  })

  it('decodes named and numeric entities', () => {
    expect(normalizeYunxiaoWorkItemDescription('A &amp; B&nbsp;&#65;&#x42;')).toBe('A & B AB')
  })

  it('stringifies object payloads that carry no known text field', () => {
    expect(normalizeYunxiaoWorkItemDescription({ blocks: ['a'] })).toBe('{"blocks":["a"]}')
  })

  it('unwraps rich-text JSON strings into readable paragraphs', () => {
    const payload = JSON.stringify({ htmlValue: '<p>第一段</p><p>第二段</p>', jsonMLValue: [] })
    expect(normalizeYunxiaoWorkItemDescription(payload)).toBe('第一段\n第二段')
  })

  it('prefers markdownValue when the object carries both formats', () => {
    expect(
      normalizeYunxiaoWorkItemDescription({
        htmlValue: '<p>旧</p>',
        markdownValue: '**新**'
      })
    ).toBe('**新**')
  })

  it('keeps a markdown body that merely starts with a brace', () => {
    expect(normalizeYunxiaoWorkItemDescription('{不是 JSON 的正文')).toBe('{不是 JSON 的正文')
  })

  it('returns an empty string for missing descriptions', () => {
    expect(normalizeYunxiaoWorkItemDescription(null)).toBe('')
    expect(normalizeYunxiaoWorkItemDescription(undefined)).toBe('')
    expect(normalizeYunxiaoWorkItemDescription('   ')).toBe('')
  })

  it('collapses runs of blank lines and trailing spaces', () => {
    expect(normalizeYunxiaoWorkItemDescription('a   \n\n\n\nb')).toBe('a\n\nb')
  })
})
