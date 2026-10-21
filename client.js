/**
 * MCP Manager (Client half).
 *
 * Registers one settings page ("MCP servers") that lists the profile's MCP
 * servers, edits them in place, tests a draft connection, and toggles or
 * removes entries. All persistence and connection work lives in the Host half
 * behind `/mcp-connect/api/*`.
 */
window.__ModuleLoader__.load({
  id: 'dsh-mcp-connect',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'mcp-connect'
    const API = '/mcp-connect/api'
    /** Bound translate function; assigned when the plugin activates. */
    let t = key => key

    const ZH = {
      nav: 'MCP 服务器',
      title: 'MCP 服务器',
      desc: '在这里添加、修改、测试 MCP 服务器。保存后立即连接，工具以 mcp__<名称>__<工具> 的形式出现。',
      storeAt: '配置文件',
      add: '添加服务器',
      addTitle: '添加 MCP 服务器',
      editTitle: '编辑 MCP 服务器',
      empty: '还没有 MCP 服务器。',
      loading: '加载中…',
      name: '名称',
      nameHint: '字母、数字、下划线和短横线，最长 32 位；会进入工具名。',
      transport: '传输方式',
      command: '命令',
      args: '参数（每行一个）',
      cwd: '工作目录',
      env: '环境变量（每行 KEY=VALUE）',
      url: 'URL',
      headers: '请求头（每行 Name: Value）',
      timeout: '调用超时（毫秒）',
      enabled: '启用',
      save: '保存',
      cancel: '取消',
      test: '测试连接',
      testing: '测试中…',
      delete: '删除',
      confirmDelete: '确定删除这个 MCP 服务器？',
      edit: '编辑',
      yaml: '查看 YAML',
      hideYaml: '收起 YAML',
      statusActive: '已连接',
      statusFailed: '连接失败',
      statusConnecting: '连接中…',
      statusDisabled: '已停用',
      disable: '停用',
      statusStopped: '未连接',
      toolUnit: '个工具',
      externalTitle: '来自配置文件的服务器',
      externalNote: '这些行来自 YAML 配置，只能查看；如需在本页管理，请把它们加到这里并从 YAML 中移除。',
      reload: '重新加载',
      nameRequired: '请填写名称。',
      urlRequired: '请填写 URL。',
      commandRequired: '请填写命令。',
      saved: '已保存',
      deleteFailed: '删除失败',
      importOpen: '导入 JSON',
      importTitle: '导入 MCP 配置',
      importHint: '粘贴 JSON：{ "名称": { "type": "http", "url": "...", "headers": { ... } } }，也支持外层带 mcpServers。值里的 ${VAR} 会从 ~/.dsh/.env 读取，导入时不会把展开后的值写进配置。',
      importPlaceholder: '{\n  "notes": {\n    "type": "http",\n    "url": "http://127.0.0.1:3000/mcp",\n    "headers": { "Authorization": "Bearer ${NOTES_TOKEN}" }\n  },\n  "github": {\n    "type": "stdio",\n    "command": "npx",\n    "args": ["-y", "@modelcontextprotocol/server-github"]\n  }\n}',
      importRun: '导入',
      importClose: '关闭',
      importAdded: '已新增',
      importUpdated: '已更新',
      importFailed: '失败',
      importNone: '请先粘贴 JSON 配置',
      dotenvLine: '环境变量',
      dotenvCount: '个变量',
      dotenvMissing: '未找到，可用 ${VAR} 从进程环境读取',
      envHint: '支持 ${VAR}，来自 ~/.dsh/.env',
    }

    const EN = {
      nav: 'MCP servers',
      title: 'MCP servers',
      desc: 'Add, edit and test Model Context Protocol servers. Saving connects immediately; tools appear as mcp__<name>__<tool>.',
      storeAt: 'Registry',
      add: 'Add server',
      addTitle: 'Add MCP server',
      editTitle: 'Edit MCP server',
      empty: 'No MCP servers yet.',
      loading: 'Loading…',
      name: 'Name',
      nameHint: 'Letters, digits, _ and -, up to 32 characters; it becomes part of every tool name.',
      transport: 'Transport',
      command: 'Command',
      args: 'Arguments (one per line)',
      cwd: 'Working directory',
      env: 'Environment (KEY=VALUE, one per line)',
      url: 'URL',
      headers: 'Headers (Name: Value, one per line)',
      timeout: 'Call timeout (ms)',
      enabled: 'Enabled',
      save: 'Save',
      cancel: 'Cancel',
      test: 'Test connection',
      testing: 'Testing…',
      delete: 'Delete',
      confirmDelete: 'Delete this MCP server?',
      edit: 'Edit',
      yaml: 'Show YAML',
      hideYaml: 'Hide YAML',
      statusActive: 'Connected',
      statusFailed: 'Failed',
      statusConnecting: 'Connecting…',
      statusDisabled: 'Disabled',
      disable: 'Disable',
      statusStopped: 'Not connected',
      toolUnit: 'tools',
      externalTitle: 'Servers from configuration files',
      externalNote: 'These rows come from YAML configuration and are read-only here. Add them on this page and remove them from YAML to manage them here.',
      reload: 'Reload',
      nameRequired: 'Name is required.',
      urlRequired: 'URL is required.',
      commandRequired: 'Command is required.',
      saved: 'Saved',
      deleteFailed: 'Delete failed',
      importOpen: 'Import JSON',
      importTitle: 'Import MCP configuration',
      importHint: 'Paste JSON: { "name": { "type": "http", "url": "...", "headers": { ... } } }, optionally wrapped in mcpServers. ${VAR} placeholders resolve from ~/.dsh/.env and are not written into the registry.',
      importPlaceholder: '{\n  "notes": {\n    "type": "http",\n    "url": "http://127.0.0.1:3000/mcp",\n    "headers": { "Authorization": "Bearer ${NOTES_TOKEN}" }\n  },\n  "github": {\n    "type": "stdio",\n    "command": "npx",\n    "args": ["-y", "@modelcontextprotocol/server-github"]\n  }\n}',
      importRun: 'Import',
      importClose: 'Close',
      importAdded: 'Added',
      importUpdated: 'Updated',
      importFailed: 'Failed',
      importNone: 'Paste a JSON document first',
      dotenvLine: 'Environment',
      dotenvCount: 'variables',
      dotenvMissing: 'not found; ${VAR} falls back to the process environment',
      envHint: 'Supports ${VAR} from ~/.dsh/.env',
    }

    const CSS = `
.mcpMgr{display:flex;flex-direction:column;gap:14px;padding:2px 0 24px;max-width:780px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}
.mcpMgr-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.mcpMgr-title{margin:0;font-size:15px;font-weight:600;line-height:1.4}
.mcpMgr-desc{margin:4px 0 0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.mcpMgr-store{display:block;margin-top:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all}
.mcpMgr-btn{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:inherit;font:inherit;font-size:12px;line-height:1.2;padding:6px 12px;border-radius:8px;cursor:pointer;transition:background .12s ease,border-color .12s ease;white-space:nowrap}
.mcpMgr-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
.mcpMgr-btn:disabled{opacity:.5;cursor:default}
.mcpMgr-btn--primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground,#fff)}
.mcpMgr-btn--primary:hover:not(:disabled){background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);opacity:.9}
.mcpMgr-btn--danger{color:var(--dsw-alias-state-error-primary)}
.mcpMgr-btn--ghost{border-color:transparent}
.mcpMgr-banner{border:1px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);border-radius:8px;padding:8px 10px;font-size:12px;white-space:pre-wrap;word-break:break-word}
.mcpMgr-list{display:flex;flex-direction:column;gap:8px}
.mcpMgr-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.mcpMgr-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.mcpMgr-card-id{display:flex;align-items:center;gap:8px;min-width:0}
.mcpMgr-name{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mcpMgr-chip{font-size:11px;padding:1px 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);white-space:nowrap}
.mcpMgr-status{font-size:11px;display:inline-flex;align-items:center;gap:5px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.mcpMgr-status::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}
.mcpMgr-status--ok{color:var(--dsw-alias-state-success-primary)}
.mcpMgr-status--ok::before{background:var(--dsw-alias-state-success-primary)}
.mcpMgr-status--err{color:var(--dsw-alias-state-error-primary)}
.mcpMgr-status--err::before{background:var(--dsw-alias-state-error-primary)}
.mcpMgr-target{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all}
.mcpMgr-error{font-size:12px;color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;word-break:break-word}
.mcpMgr-actions{display:flex;gap:6px;flex-wrap:wrap}
.mcpMgr-editor{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:14px;display:flex;flex-direction:column;gap:12px}
.mcpMgr-editor-head{display:flex;justify-content:space-between;align-items:center;gap:12px}
.mcpMgr-editor-title{font-size:13px;font-weight:600}
.mcpMgr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px}
.mcpMgr-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.mcpMgr-field--wide{grid-column:1 / -1}
.mcpMgr-field-label{font-size:11px;color:var(--dsw-alias-label-secondary)}
.mcpMgr-field-hint{font-size:11px;color:var(--dsw-alias-label-secondary);opacity:.85}
.mcpMgr-input,.mcpMgr-area,.mcpMgr-select{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:inherit;font:inherit;font-size:12px;border-radius:8px;padding:6px 8px;outline:none}
.mcpMgr-input:focus,.mcpMgr-area:focus,.mcpMgr-select:focus{border-color:var(--dsw-alias-brand-primary)}
.mcpMgr-input:disabled{opacity:.6}
.mcpMgr-area{min-height:62px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.mcpMgr-area--code{min-height:170px;line-height:1.5}
.mcpMgr-results{display:flex;flex-direction:column;gap:4px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:8px}
.mcpMgr-result{display:flex;gap:8px;font-size:12px;align-items:baseline;flex-wrap:wrap}
.mcpMgr-result--ok{color:var(--dsw-alias-state-success-primary)}
.mcpMgr-result--err{color:var(--dsw-alias-state-error-primary)}
.mcpMgr-result-name{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dsw-alias-label-primary)}
.mcpMgr-select{height:30px}
.mcpMgr-check{display:flex;align-items:center;gap:6px;font-size:12px}
.mcpMgr-check input{margin:0}
.mcpMgr-editor-actions{display:flex;justify-content:flex-end;gap:8px}
.mcpMgr-test{font-size:12px;border-radius:8px;padding:8px 10px;background:var(--dsw-alias-bg-layer-2);white-space:pre-wrap;word-break:break-word}
.mcpMgr-test--ok{color:var(--dsw-alias-state-success-primary)}
.mcpMgr-test--err{color:var(--dsw-alias-state-error-primary)}
.mcpMgr-test-tools{margin:6px 0 0;padding-left:18px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;max-height:160px;overflow:auto}
.mcpMgr-pre{margin:0;padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;overflow:auto;white-space:pre-wrap;word-break:break-word}
.mcpMgr-empty{border:1px dashed var(--dsw-alias-border-l1);border-radius:10px;padding:24px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12px}
.mcpMgr-section-title{font-size:12px;font-weight:600;margin:2px 0 0}
.mcpMgr-note{font-size:11px;color:var(--dsw-alias-label-secondary);margin:0}
.mcpMgr-external{display:flex;flex-direction:column;gap:6px}
@media (max-width:560px){.mcpMgr-grid{grid-template-columns:1fr}}
`

    function splitLines(value) {
      return String(value ?? '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
    }

    function pairs(text, separator) {
      const result = {}
      for (const line of splitLines(text)) {
        const index = line.indexOf(separator)
        if (index <= 0) continue
        const key = line.slice(0, index).trim()
        const value = line.slice(index + separator.length).trim()
        if (key) result[key] = value
      }
      return result
    }

    async function request(action, body) {
      let response
      try {
        response = await fetch(`${API}/${action}`, {
          method: body === undefined ? 'GET' : 'POST',
          credentials: 'same-origin',
          headers: body === undefined ? undefined : { 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      } catch (error) {
        throw new Error(`${action}: ${error?.message ?? error}`)
      }
      const text = await response.text()
      let data
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        throw new Error(`${action}: unexpected response (${response.status})`)
      }
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error ?? `${action}: HTTP ${response.status}`)
      }
      return data
    }

    function emptyDraft() {
      return {
        originalName: null,
        serverName: '',
        transport: 'streamable-http',
        url: '',
        headersText: '',
        command: 'npx',
        argsText: '',
        cwd: '',
        envText: '',
        toolCallTimeoutMs: '60000',
        enabled: true,
      }
    }

    function draftFrom(server) {
      return {
        originalName: server.serverName,
        serverName: server.serverName,
        transport: server.transport,
        url: server.url ?? '',
        headersText: Object.entries(server.headers ?? {}).map(([key, value]) => `${key}: ${value}`).join('\n'),
        command: server.command ?? 'npx',
        argsText: Array.isArray(server.args) ? server.args.join('\n') : '',
        cwd: server.cwd ?? '',
        envText: Object.entries(server.env ?? {}).map(([key, value]) => `${key}=${value}`).join('\n'),
        toolCallTimeoutMs: String(server.toolCallTimeoutMs ?? 60000),
        enabled: server.enabled !== false,
      }
    }

    function serverFromDraft(draft) {
      const base = {
        serverName: draft.serverName.trim(),
        transport: draft.transport,
        enabled: draft.enabled,
        toolCallTimeoutMs: Number(draft.toolCallTimeoutMs) || 60000,
      }
      if (draft.transport === 'stdio') {
        return {
          ...base,
          command: draft.command.trim(),
          args: splitLines(draft.argsText),
          cwd: draft.cwd.trim(),
          env: pairs(draft.envText, '='),
        }
      }
      return {
        ...base,
        url: draft.url.trim(),
        headers: pairs(draft.headersText, ':'),
      }
    }

    function targetOf(server) {
      if (server.transport === 'stdio') {
        return [server.command, ...(server.args ?? [])].filter(Boolean).join(' ')
      }
      return server.url ?? ''
    }

    function Section() {
      const [state, setState] = React.useState({ loading: true, servers: [], external: [], file: '', dotenv: { file: '', exists: false, keys: [] }, error: null })
      const [draft, setDraft] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [test, setTest] = React.useState(null)
      const [yamlOpen, setYamlOpen] = React.useState(null)
      const [importOpen, setImportOpen] = React.useState(false)
      const [importText, setImportText] = React.useState('')
      const [importResult, setImportResult] = React.useState(null)

      const refresh = React.useCallback(async () => {
        try {
          const data = await request('list')
          setState(previous => ({
            loading: false,
            servers: Array.isArray(data.servers) ? data.servers : [],
            external: Array.isArray(data.external) ? data.external : [],
            file: data.file ?? '',
            dotenv: data.dotenv ?? previous.dotenv,
            error: data.loadError ?? null,
          }))
        } catch (error) {
          setState(previous => ({ ...previous, loading: false, error: error.message }))
        }
      }, [])

      React.useEffect(() => {
        refresh()
      }, [refresh])

      function fail(error) {
        setState(previous => ({ ...previous, error: error?.message ?? String(error) }))
      }

      async function apply(action, body) {
        setBusy(true)
        try {
          const data = await request(action, body)
          setState({
            loading: false,
            servers: Array.isArray(data.servers) ? data.servers : [],
            external: Array.isArray(data.external) ? data.external : [],
            file: data.file ?? '',
            dotenv: data.dotenv ?? state.dotenv,
            error: data.loadError ?? null,
          })
          return true
        } catch (error) {
          fail(error)
          return false
        } finally {
          setBusy(false)
        }
      }

      function openAdd() {
        setTest(null)
        setImportOpen(false)
        setDraft(emptyDraft())
      }

      function openImport() {
        setDraft(null)
        setTest(null)
        setImportResult(null)
        setImportOpen(true)
      }

      async function runImport() {
        if (!importText.trim()) {
          fail(new Error(t('importNone')))
          return
        }
        setBusy(true)
        try {
          const data = await request('import', { text: importText })
          setState({
            loading: false,
            servers: Array.isArray(data.servers) ? data.servers : [],
            external: Array.isArray(data.external) ? data.external : [],
            file: data.file ?? '',
            dotenv: data.dotenv ?? state.dotenv,
            error: null,
          })
          setImportResult(Array.isArray(data.results) ? data.results : [])
          // New connections settle in the background; refresh once they had a moment.
          setTimeout(() => { refresh() }, 1500)
          setTimeout(() => { refresh() }, 5000)
        } catch (error) {
          fail(error)
        } finally {
          setBusy(false)
        }
      }

      function openEdit(server) {
        setTest(null)
        setDraft(draftFrom(server))
      }

      function update(key, value) {
        setDraft(previous => (previous ? { ...previous, [key]: value } : previous))
      }

      function validate(server) {
        if (!server.serverName) return t('nameRequired')
        if (server.transport === 'stdio' && !server.command) return t('commandRequired')
        if (server.transport === 'streamable-http' && !server.url) return t('urlRequired')
        return null
      }

      async function runSave() {
        const server = serverFromDraft(draft)
        const problem = validate(server)
        if (problem) {
          fail(new Error(problem))
          return
        }
        const ok = await apply('save', { server, originalName: draft.originalName })
        if (ok) {
          setDraft(null)
          setTest(null)
        }
      }

      async function runTest() {
        const server = serverFromDraft(draft)
        const problem = validate(server)
        if (problem) {
          fail(new Error(problem))
          return
        }
        setBusy(true)
        setTest({ pending: true })
        try {
          const result = await request('test', { server })
          setTest(result)
        } catch (error) {
          setTest({ ok: false, error: error.message })
        } finally {
          setBusy(false)
        }
      }

      async function runRemove(server) {
        if (!window.confirm(t('confirmDelete'))) return
        await apply('remove', { serverName: server.serverName })
      }

      async function runToggle(server) {
        await apply('toggle', { serverName: server.serverName, enabled: !(server.enabled !== false) })
      }

      function statusView(server) {
        if (server.status === 'active') {
          return { tone: 'ok', text: `${t('statusActive')} · ${server.tools} ${t('toolUnit')}` }
        }
        if (server.status === 'failed') return { tone: 'err', text: t('statusFailed') }
        if (server.status === 'connecting') return { tone: 'idle', text: t('statusConnecting') }
        if (server.status === 'disabled') return { tone: 'idle', text: t('statusDisabled') }
        return { tone: 'idle', text: t('statusStopped') }
      }

      function field(label, control, hint, wide) {
        return h('label', { key: label, className: `mcpMgr-field${wide ? ' mcpMgr-field--wide' : ''}` },
          h('span', { className: 'mcpMgr-field-label' }, label),
          control,
          hint ? h('span', { className: 'mcpMgr-field-hint' }, hint) : null)
      }

      function textInput(key, options) {
        return h('input', {
          className: 'mcpMgr-input',
          value: draft[key],
          spellCheck: false,
          onChange: event => update(key, event.target.value),
          ...options,
        })
      }

      function textArea(key, rows) {
        return h('textarea', {
          className: 'mcpMgr-area',
          rows,
          spellCheck: false,
          value: draft[key],
          onChange: event => update(key, event.target.value),
        })
      }

      function editor() {
        return h('div', { className: 'mcpMgr-editor' },
          h('div', { className: 'mcpMgr-editor-head' },
            h('span', { className: 'mcpMgr-editor-title' }, draft.originalName ? t('editTitle') : t('addTitle')),
            h('button', {
              type: 'button',
              className: 'mcpMgr-btn mcpMgr-btn--ghost',
              onClick: () => { setDraft(null); setTest(null) },
            }, t('cancel'))),
          h('div', { className: 'mcpMgr-grid' },
            field(t('name'), textInput('serverName', {
              placeholder: 'github',
              disabled: Boolean(draft.originalName),
            }), t('nameHint')),
            field(t('transport'), h('select', {
              className: 'mcpMgr-select',
              value: draft.transport,
              onChange: event => update('transport', event.target.value),
            },
            h('option', { value: 'streamable-http' }, 'Streamable HTTP'),
            h('option', { value: 'stdio' }, 'stdio'))),
            draft.transport === 'stdio'
              ? [
                field(t('command'), textInput('command', { placeholder: 'npx' })),
                field(t('cwd'), textInput('cwd', { placeholder: '/path/to/dir' })),
                field(t('args'), textArea('argsText', 3), t('envHint'), true),
                field(t('env'), textArea('envText', 3), t('envHint'), true),
              ]
              : [
                field(t('url'), textInput('url', { placeholder: 'https://example.com/mcp' }), t('envHint'), true),
                field(t('headers'), textArea('headersText', 3), t('envHint'), true),
              ],
            field(t('timeout'), textInput('toolCallTimeoutMs', { inputMode: 'numeric' }))),
          h('label', { className: 'mcpMgr-check' },
            h('input', {
              type: 'checkbox',
              checked: draft.enabled,
              onChange: event => update('enabled', event.target.checked),
            }),
            h('span', null, t('enabled'))),
          h('div', { className: 'mcpMgr-editor-actions' },
            h('button', { type: 'button', className: 'mcpMgr-btn', disabled: busy, onClick: runTest }, test?.pending ? t('testing') : t('test')),
            h('button', { type: 'button', className: 'mcpMgr-btn mcpMgr-btn--primary', disabled: busy, onClick: runSave }, t('save'))),
          test ? testView() : null)
      }

      function importPanel() {
        return h('div', { className: 'mcpMgr-editor' },
          h('div', { className: 'mcpMgr-editor-head' },
            h('span', { className: 'mcpMgr-editor-title' }, t('importTitle')),
            h('button', {
              type: 'button',
              className: 'mcpMgr-btn mcpMgr-btn--ghost',
              onClick: () => { setImportOpen(false); setImportResult(null) },
            }, t('importClose'))),
          h('p', { className: 'mcpMgr-note' }, t('importHint')),
          h('textarea', {
            className: 'mcpMgr-area mcpMgr-area--code',
            rows: 10,
            spellCheck: false,
            value: importText,
            placeholder: t('importPlaceholder'),
            onChange: event => setImportText(event.target.value),
          }),
          importResult
            ? h('div', { className: 'mcpMgr-results' }, importResult.map(row => h('div', {
              key: row.serverName,
              className: `mcpMgr-result mcpMgr-result--${row.action === 'failed' ? 'err' : 'ok'}`,
            },
            h('code', { className: 'mcpMgr-result-name' }, row.serverName),
            h('span', null, row.action === 'failed'
              ? `${t('importFailed')} · ${row.error}`
              : row.action === 'updated' ? t('importUpdated') : t('importAdded')))))
            : null,
          h('div', { className: 'mcpMgr-editor-actions' },
            h('button', {
              type: 'button',
              className: 'mcpMgr-btn mcpMgr-btn--primary',
              disabled: busy || !importText.trim(),
              onClick: runImport,
            }, t('importRun'))))
      }

      function testView() {
        if (test.pending) {
          return h('div', { className: 'mcpMgr-test' }, t('testing'))
        }
        if (test.ok) {
          const tools = Array.isArray(test.tools) ? test.tools : []
          return h('div', { className: 'mcpMgr-test mcpMgr-test--ok' },
            `${t('statusActive')} · ${tools.length} ${t('toolUnit')} · ${test.ms ?? 0}ms`,
            tools.length
              ? h('ul', { className: 'mcpMgr-test-tools' }, tools.map(tool => h('li', { key: tool }, tool)))
              : null)
        }
        return h('div', { className: 'mcpMgr-test mcpMgr-test--err' }, test.error ?? t('statusFailed'))
      }

      function card(server) {
        const status = statusView(server)
        return h('div', { className: 'mcpMgr-card', key: server.serverName },
          h('div', { className: 'mcpMgr-card-head' },
            h('div', { className: 'mcpMgr-card-id' },
              h('span', { className: 'mcpMgr-name' }, server.serverName),
              h('span', { className: 'mcpMgr-chip' }, server.transport)),
            h('span', { className: `mcpMgr-status mcpMgr-status--${status.tone}` }, status.text)),
          h('div', { className: 'mcpMgr-target' }, targetOf(server)),
          server.error ? h('div', { className: 'mcpMgr-error' }, server.error) : null,
          h('div', { className: 'mcpMgr-actions' },
            h('button', {
              type: 'button',
              className: 'mcpMgr-btn',
              disabled: busy,
              onClick: () => runToggle(server),
            }, server.enabled ? t('disable') : t('enabled')),
            h('button', {
              type: 'button',
              className: 'mcpMgr-btn',
              disabled: busy,
              onClick: () => openEdit(server),
            }, t('edit')),
            h('button', {
              type: 'button',
              className: 'mcpMgr-btn mcpMgr-btn--ghost',
              onClick: () => setYamlOpen(yamlOpen === server.serverName ? null : server.serverName),
            }, yamlOpen === server.serverName ? t('hideYaml') : t('yaml')),
            h('button', {
              type: 'button',
              className: 'mcpMgr-btn mcpMgr-btn--danger',
              disabled: busy,
              onClick: () => runRemove(server),
            }, t('delete'))),
          yamlOpen === server.serverName ? h('pre', { className: 'mcpMgr-pre' }, server.yaml) : null)
      }

      const external = state.external.length
        ? h('div', { className: 'mcpMgr-external' },
          h('div', { className: 'mcpMgr-section-title' }, t('externalTitle')),
          h('p', { className: 'mcpMgr-note' }, t('externalNote')),
          state.external.map(row => h('div', { className: 'mcpMgr-card', key: row.rowId },
            h('div', { className: 'mcpMgr-card-head' },
              h('div', { className: 'mcpMgr-card-id' },
                h('span', { className: 'mcpMgr-name' }, row.serverName),
                h('span', { className: 'mcpMgr-chip' }, row.transport ?? '')),
              h('span', { className: 'mcpMgr-status mcpMgr-status--ok' }, `${row.tools} ${t('toolUnit')}`)),
            h('div', { className: 'mcpMgr-target' }, row.target ?? ''),
            h('div', { className: 'mcpMgr-target' }, row.rowId))))
        : null

      return h('div', { className: 'mcpMgr' },
        h('style', null, CSS),
        h('div', { className: 'mcpMgr-header' },
          h('div', { style: { minWidth: 0 } },
            h('h2', { className: 'mcpMgr-title' }, t('title')),
            h('p', { className: 'mcpMgr-desc' }, t('desc')),
            state.file ? h('code', { className: 'mcpMgr-store' }, `${t('storeAt')}: ${state.file}`) : null,
            state.dotenv?.file
              ? h('code', {
                className: 'mcpMgr-store',
                title: state.dotenv.keys.length ? state.dotenv.keys.join(', ') : '',
              }, `${t('dotenvLine')}: ${state.dotenv.file}${state.dotenv.exists
                ? ` · ${state.dotenv.keys.length} ${t('dotenvCount')}`
                : ` · ${t('dotenvMissing')}`}`)
              : null),
          h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' } },
            h('button', {
              type: 'button',
              className: 'mcpMgr-btn mcpMgr-btn--ghost',
              disabled: busy,
              onClick: () => apply('reload', {}),
            }, t('reload')),
            h('button', {
              type: 'button',
              className: 'mcpMgr-btn',
              disabled: busy || Boolean(draft),
              onClick: openImport,
            }, t('importOpen')),
            h('button', {
              type: 'button',
              className: 'mcpMgr-btn mcpMgr-btn--primary',
              disabled: busy || Boolean(draft) || importOpen,
              onClick: openAdd,
            }, t('add')))),
        state.error ? h('div', { className: 'mcpMgr-banner' }, state.error) : null,
        draft ? editor() : null,
        importOpen ? importPanel() : null,
        state.loading
          ? h('div', { className: 'mcpMgr-empty' }, t('loading'))
          : state.servers.length
            ? h('div', { className: 'mcpMgr-list' }, state.servers.map(card))
            : h('div', { className: 'mcpMgr-empty' }, t('empty')),
        external)
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const locale = ctx.locale
        ctx.effect(() => locale.register(NS, 'zh', ZH), 'mcp-connect: zh dictionary')
        ctx.effect(() => locale.register(NS, 'en', EN), 'mcp-connect: en dictionary')
        t = locale.bind(NS)
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'mcp-servers',
          order: 25,
          label: () => t('nav'),
          locale: NS,
        }, Section)), 'mcp-connect: settings section')
      },
    }
  },
})
