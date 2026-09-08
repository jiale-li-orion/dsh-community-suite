// @vitest-environment jsdom
/**
 * createWorkbenchStore unit account: the initial selections, the four actions'
 * write sets, and instance independence (the factory is not a singleton). Uses
 * the test-sanctioned path: factory self-call + `.create()`.
 */
import { describe, expect, it } from 'vitest'
import { createWorkbenchStore } from '../src/client/stores.ts'
import type { WorkbenchFileRef } from '../src/client/contract/slots.ts'

const FILE: WorkbenchFileRef = {
  name: 'photo.png',
  path: '/w/photo.png',
  url: '/workbench/file?sessionId=s&path=%2Fw%2Fphoto.png',
  mediaType: 'image/png',
}

describe('createWorkbenchStore', () => {
  it('starts with nothing selected and no previewed file', () => {
    const { store } = createWorkbenchStore().create()
    expect(store.getSnapshot()).toEqual({ active: null, file: null })
  })

  it('select writes the panel id and clear drops the selection', () => {
    const { store, actions } = createWorkbenchStore().create()
    actions.select('files')
    expect(store.getSnapshot()).toEqual({ active: 'files', file: null })
    actions.select('git')
    expect(store.getSnapshot()).toEqual({ active: 'git', file: null })
    actions.clear()
    expect(store.getSnapshot()).toEqual({ active: null, file: null })
  })

  it('preview writes the file and closeFile drops it without touching the panel', () => {
    const { store, actions } = createWorkbenchStore().create()
    actions.select('files')
    actions.preview(FILE)
    expect(store.getSnapshot()).toEqual({ active: 'files', file: FILE })
    actions.closeFile()
    expect(store.getSnapshot()).toEqual({ active: 'files', file: null })
  })

  it('each create() is an independent instance', () => {
    const a = createWorkbenchStore().create()
    const b = createWorkbenchStore().create()
    a.actions.select('files')
    a.actions.preview(FILE)
    expect(b.store.getSnapshot()).toEqual({ active: null, file: null })
  })
})
