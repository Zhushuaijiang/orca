// `orca plugin check` renders the panel once per scenario against a mock host.

import { defineCheck } from 'orca/testing'

export default defineCheck({
  未配置: {
    requests: {
      'kb.status': {
        configured: false,
        serverUrl: '',
        username: '',
        ok: false,
        error: null
      }
    }
  },
  浏览: {
    requests: {
      'kb.status': {
        configured: true,
        serverUrl: 'http://192.168.1.10:18100',
        username: 'ncadmin',
        ok: true,
        error: null
      },
      'kb.list': {
        entries: [
          {
            name: '东昉协作',
            path: '/东昉协作',
            dir: true,
            size: 0,
            modifiedMs: 1769304000000,
            etag: '0e4a2f9c11d01b',
            fileId: '14290'
          },
          {
            name: '部署手册.md',
            path: '/部署手册.md',
            dir: false,
            size: 4096,
            modifiedMs: 1769304000000,
            etag: 'aa11bb22cc33',
            fileId: '14400'
          }
        ]
      }
    }
  },
  预览: {
    persisted: {
      plugin: {
        'kb.status-view': { phase: 'ready', serverUrl: 'http://192.168.1.10:18100', username: 'ncadmin' },
        'kb.tab': 'preview',
        'kb.selected': '/部署手册.md'
      }
    },
    requests: {
      'kb.status': {
        configured: true,
        serverUrl: 'http://192.168.1.10:18100',
        username: 'ncadmin',
        ok: true,
        error: null
      },
      'kb.list': { entries: [] },
      'kb.read': {
        kind: 'text',
        text: '# 部署手册\n\n1. 安装依赖\n2. 启动服务\n',
        truncated: false,
        byteLength: 48,
        etag: 'aa11bb22cc33',
        modifiedMs: 1769304000000
      }
    }
  }
})
