/**
 * MCP Manager (Host half).
 *
 * Owns a small JSON registry of MCP servers, mounts one
 * `@deepseek-ai/dsh-mcp-client` fiber per enabled server, and exposes the
 * registry to the Web settings page over a same-origin JSON route plus an
 * agent tool. Mounting happens at runtime, so a saved server's tools appear in
 * the next model step without restarting the Harness or editing YAML.
 *
 * @module dsh-mcp-connect
 */
import { createRequire } from 'node:module'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const name = 'mcp-connect'
export const inject = ['loader', 'tools']

/** Package that owns MCP connections. Its tools are `mcp__<serverName>__<tool>`. */
const MCP_PACKAGE = '@deepseek-ai/dsh-mcp-client'
/** Same-origin JSON route prefix served to the settings page. */
const API_PREFIX = '/mcp-connect/api'
/** `serverName` must stay within the MCP client's accepted namespace. */
const NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
const DEFAULT_TIMEOUT_MS = 60_000
const MAX_BODY_BYTES = 256 * 1024
const CONNECT_TIMEOUT_MS = 45_000
/** Bumped whenever the registry semantics or snapshot shape change. */
const VERSION = '0.2.0'

/** The Harness data root: one registry and one .env serve the installation. */
function dshHome() {
  return process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
}

/**
 * Absolute path of the registry file. One registry serves every profile of
 * this Harness installation, so the location never depends on how the
 * process was launched.
 */
function dataFile() {
  return join(dshHome(), 'mcp-servers.json')
}

/** Environment file read for `${VAR}` expansion in server definitions. */
function dotEnvFile() {
  return join(dshHome(), '.env')
}

/**
 * Parse the subset of dotenv syntax an operator writes by hand: `KEY=VALUE`
 * lines, `#` comments, an optional `export ` prefix, and single or double
 * quoted values (quoted values keep surrounding spaces and ignore `#`).
 * @param {string} text - file contents.
 * @returns {Record<string, string>} declared values.
 */
export function parseDotEnv(text) {
  const values = {}
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    let line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('export ')) line = line.slice(7).trimStart()
    const equals = line.indexOf('=')
    if (equals <= 0) continue
    const key = line.slice(0, equals).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    let value = line.slice(equals + 1).trim()
    const quoted = value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    if (quoted) {
      value = value.slice(1, -1)
    } else {
      const comment = value.search(/\s#/)
      if (comment >= 0) value = value.slice(0, comment).trimEnd()
    }
    values[key] = value
  }
  return values
}

/** Values declared in `~/.dsh/.env`; a missing file reads as empty. */
async function readDotEnv() {
  let text
  try {
    text = await readFile(dotEnvFile(), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
  return parseDotEnv(text)
}

/**
 * Variables a definition may reference: the process environment wins over
 * `.env` for any name it defines non-empty, matching dotenv precedence.
 */
async function environment() {
  return { ...(await readDotEnv()), ...nonEmptyProcessEnv() }
}

function nonEmptyProcessEnv() {
  const values = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && value !== '') values[key] = value
  }
  return values
}

const PLACEHOLDER = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g

/**
 * Expand `${VAR}` placeholders. A missing variable fails loudly instead of
 * sending the literal text to a server.
 * @param {string} value - configured text.
 * @param {Record<string, string>} vars - resolved environment.
 * @returns {string} expanded text.
 */
export function resolveTemplate(value, vars) {
  if (typeof value !== 'string' || !value.includes('${')) return value
  return value.replace(PLACEHOLDER, (_, key) => {
    if (!Object.hasOwn(vars, key)) {
      throw failure(`environment variable ${key} is not defined (add it to ${dotEnvFile()} or the process environment)`)
    }
    return vars[key]
  })
}

function assertHttpUrl(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw failure('url must be an absolute http(s) URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw failure('url must be an absolute http(s) URL')
  }
}

/**
 * Expand every templated field of one definition and validate the result.
 * Storage keeps the raw text, so `.env` changes apply on the next connect.
 */
export function resolveServer(server, vars) {
  const env = {}
  for (const [key, value] of Object.entries(server.env ?? {})) env[key] = resolveTemplate(value, vars)
  const headers = {}
  for (const [key, value] of Object.entries(server.headers ?? {})) headers[key] = resolveTemplate(value, vars)
  const resolved = {
    ...server,
    command: resolveTemplate(server.command ?? '', vars),
    args: (server.args ?? []).map(argument => resolveTemplate(argument, vars)),
    cwd: resolveTemplate(server.cwd ?? '', vars),
    url: resolveTemplate(server.url ?? '', vars),
    env,
    headers,
  }
  if (resolved.transport === 'streamable-http') assertHttpUrl(resolved.url)
  if (resolved.transport === 'stdio' && !resolved.command) throw failure('command is required for stdio')
  return resolved
}

function emptyStore() {
  return { version: 1, servers: [] }
}

async function readStore() {
  let text
  try {
    text = await readFile(dataFile(), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyStore()
    throw error
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`registry file is not valid JSON: ${dataFile()}`)
  }
  if (!Array.isArray(parsed?.servers)) return emptyStore()
  return { version: 1, servers: parsed.servers.filter(entry => entry && typeof entry === 'object') }
}

async function writeStore(store) {
  const file = dataFile()
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.tmp`
  await writeFile(temporary, `${JSON.stringify({ version: 1, servers: store.servers }, null, 2)}\n`, 'utf8')
  await rename(temporary, file)
}

function failure(message) {
  const error = new Error(message)
  error.expose = true
  return error
}

function textOf(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function recordOf(value) {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) throw failure('expected an object')
  const result = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') throw failure(`${key} must be a string`)
    result[key] = entry
  }
  return result
}

function listOf(value) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw failure('args must be an array of strings')
  return value.map(entry => {
    if (typeof entry !== 'string') throw failure('args must be an array of strings')
    return entry
  })
}

/**
 * Validate one server definition coming from the UI, the tool, or disk.
 * @param {unknown} raw - candidate definition.
 * @returns {object} a complete, sanitized definition.
 */
function parseServer(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw failure('server must be an object')
  const serverName = textOf(raw.serverName)
  if (!NAME_PATTERN.test(serverName)) {
    throw failure('serverName must match [A-Za-z0-9_-]{1,32}')
  }
  const transport = raw.transport
  if (transport !== 'stdio' && transport !== 'streamable-http') {
    throw failure('transport must be "stdio" or "streamable-http"')
  }
  const timeout = Number(raw.toolCallTimeoutMs)
  const toolCallTimeoutMs = Number.isFinite(timeout) && timeout > 0 ? Math.floor(timeout) : DEFAULT_TIMEOUT_MS
  const enabled = raw.enabled !== false
  if (transport === 'stdio') {
    const command = textOf(raw.command)
    if (!command) throw failure('command is required for stdio')
    return {
      serverName,
      transport,
      enabled,
      toolCallTimeoutMs,
      command,
      args: listOf(raw.args),
      cwd: textOf(raw.cwd),
      env: recordOf(raw.env),
    }
  }
  const url = textOf(raw.url)
  if (!url) throw failure('url is required for streamable-http')
  // A literal URL is validated now; a templated one is validated once the
  // `.env` values are known, at connect time.
  if (!url.includes('${')) assertHttpUrl(url)
  return {
    serverName,
    transport,
    enabled,
    toolCallTimeoutMs,
    url,
    headers: recordOf(raw.headers),
  }
}

/** The exact config the MCP client schema accepts for one definition. */
function clientConfig(server) {
  const base = {
    serverName: server.serverName,
    transport: server.transport,
    toolCallTimeoutMs: server.toolCallTimeoutMs,
    failOnStartupError: true,
  }
  if (server.transport === 'stdio') {
    return {
      ...base,
      command: server.command,
      args: server.args,
      env: server.env,
      cwd: server.cwd,
    }
  }
  return { ...base, url: server.url, headers: server.headers }
}

/** The YAML row an operator would write by hand, shown in the UI for reference. */
function yamlFor(server) {
  const rows = [
    `- id: mcp-${server.serverName}`,
    `  name: '${MCP_PACKAGE}'`,
    '  config:',
    `    serverName: ${server.serverName}`,
    `    transport: ${server.transport}`,
  ]
  if (server.transport === 'stdio') {
    rows.push(`    command: ${server.command}`)
    if (server.args.length) {
      rows.push(`    args: [${server.args.map(arg => JSON.stringify(arg)).join(', ')}]`)
    }
    if (server.cwd) rows.push(`    cwd: ${server.cwd}`)
    const env = Object.entries(server.env)
    if (env.length) {
      rows.push('    env:')
      for (const [key, value] of env) rows.push(`      ${key}: ${JSON.stringify(value)}`)
    }
  } else {
    rows.push(`    url: ${server.url}`)
    const headers = Object.entries(server.headers)
    if (headers.length) {
      rows.push('    headers:')
      for (const [key, value] of headers) rows.push(`      ${key}: ${JSON.stringify(value)}`)
    }
  }
  return rows.join('\n')
}

function describeError(error) {
  const cause = error?.cause
  const detail = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : ''
  const message = error instanceof Error ? error.message : String(error)
  if (!detail || message.includes(detail)) return message
  return `${message} (${detail})`
}

function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
  })
  return Promise.race([Promise.resolve(promise).finally(() => clearTimeout(timer)), timeout])
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 */
export function apply(ctx) {
  /** Persisted definitions, loaded once. */
  const store = { servers: [], loaded: false, loadError: null }
  /** Live mounts keyed by serverName. */
  const runtime = new Map()
  let modulePromise
  let sequence = Promise.resolve()

  /** Serialize registry mutations so UI clicks and tool calls cannot interleave. */
  function serialized(work) {
    const run = sequence.then(work, work)
    sequence = run.then(() => undefined, () => undefined)
    return run
  }

  /**
   * Resolve the MCP client package from the installation that started this
   * process. The profile's node_modules does not hold shipped packages, so a
   * plain `import` here would miss it.
   */
  async function loadMcpModule() {
    if (modulePromise) return modulePromise
    modulePromise = (async () => {
      const anchors = [process.argv[1], import.meta.url].filter(Boolean)
      const problems = []
      for (const anchor of anchors) {
        try {
          const target = anchor.startsWith('file:') ? anchor : pathToFileURL(resolve(anchor)).href
          const require = createRequire(target)
          const resolved = require.resolve(MCP_PACKAGE)
          return await import(pathToFileURL(resolved).href)
        } catch (error) {
          problems.push(describeError(error))
        }
      }
      try {
        return await ctx.loader.import(MCP_PACKAGE)
      } catch (error) {
        problems.push(describeError(error))
      }
      throw new Error(`cannot load ${MCP_PACKAGE}: ${problems.join(' | ')}`)
    })()
    modulePromise.catch(() => {
      modulePromise = undefined
    })
    return modulePromise
  }

  /** Tool names this server currently publishes on the shared tool registry. */
  function countTools(serverName) {
    try {
      const prefix = `mcp__${serverName}__`
      return ctx.tools
        .schemas()
        .filter(schema => typeof schema?.name === 'string' && schema.name.startsWith(prefix)).length
    } catch {
      return 0
    }
  }

  async function unmount(serverName) {
    const record = runtime.get(serverName)
    runtime.delete(serverName)
    if (!record?.fiber) return
    try {
      await record.fiber.dispose()
    } catch (error) {
      ctx.logger?.warn?.(`mcp-connect: disposing ${serverName} failed: ${describeError(error)}`)
    }
  }

  async function mount(server) {
    await unmount(server.serverName)
    let module
    try {
      module = await loadMcpModule()
    } catch (error) {
      runtime.set(server.serverName, {
        status: 'failed',
        tools: 0,
        error: describeError(error),
        fiber: null,
      })
      return
    }
    let fiber
    try {
      const resolved = resolveServer(server, await environment())
      fiber = ctx.plugin(
        { name: 'mcp-client', apply: module.apply, Config: module.Config, inject: module.inject },
        clientConfig(resolved),
      )
    } catch (error) {
      runtime.set(server.serverName, { status: 'failed', tools: 0, error: describeError(error), fiber: null })
      return
    }
    const record = { status: 'connecting', tools: 0, error: null, fiber }
    runtime.set(server.serverName, record)
    try {
      await withTimeout(fiber, CONNECT_TIMEOUT_MS, `connecting ${server.serverName}`)
      record.status = 'active'
      record.tools = countTools(server.serverName)
    } catch (error) {
      record.status = 'failed'
      record.error = describeError(error)
      record.fiber = null
      try {
        await fiber.dispose()
      } catch {
        /* the failed fiber may already be inert */
      }
    }
  }

  let loadPromise
  /** Read the registry once; concurrent callers share the same read. */
  function ensureLoaded() {
    if (store.loaded) return Promise.resolve()
    loadPromise ??= (async () => {
      try {
        const loaded = await readStore()
        store.servers = loaded.servers
          .map(entry => {
            try {
              return parseServer(entry)
            } catch {
              return null
            }
          })
          .filter(Boolean)
      } catch (error) {
        store.loadError = describeError(error)
      } finally {
        store.loaded = true
      }
    })()
    return loadPromise
  }

  /**
   * Connect every enabled server that has no mount attempt yet. Callers that
   * only read the registry do not wait for it: a dead endpoint must never
   * hold the settings page open.
   */
  async function mountMissing() {
    for (const server of store.servers) {
      if (!server.enabled) {
        await unmount(server.serverName)
        continue
      }
      if (runtime.has(server.serverName)) continue
      await mount(server)
    }
  }

  let mountQueued = false
  function scheduleMounts() {
    if (mountQueued) return
    mountQueued = true
    void serialized(async () => {
      mountQueued = false
      await ensureLoaded()
      await mountMissing()
    }).catch(error => {
      mountQueued = false
      ctx.logger?.warn?.(`mcp-connect: connecting saved servers failed: ${describeError(error)}`)
    })
  }

  /** MCP rows that come from configuration files rather than this registry. */
  function externalRows() {
    const editor = ctx.get('configEditor')
    if (typeof editor?.configuration !== 'function') return []
    try {
      return editor
        .configuration()
        .filter(({ entry }) => {
          const rowName = String(entry?.options?.name ?? '')
          return rowName === MCP_PACKAGE || rowName.endsWith('/dsh-mcp-client')
        })
        .map(({ entry }) => {
          const config = entry?.options?.config ?? {}
          const serverName = typeof config.serverName === 'string' ? config.serverName : entry.id
          return {
            rowId: entry.id,
            serverName,
            transport: config.transport ?? 'unknown',
            target: config.transport === 'stdio'
              ? [config.command, ...(Array.isArray(config.args) ? config.args : [])].filter(Boolean).join(' ')
              : String(config.url ?? ''),
            tools: countTools(serverName),
          }
        })
    } catch (error) {
      ctx.logger?.warn?.(`mcp-connect: reading configured MCP rows failed: ${describeError(error)}`)
      return []
    }
  }

  /** `.env` names only: values never leave the Host. */
  async function dotEnvSummary() {
    let exists = false
    try {
      await readFile(dotEnvFile(), 'utf8')
      exists = true
    } catch {
      exists = false
    }
    try {
      const values = await readDotEnv()
      return { file: dotEnvFile(), exists, keys: Object.keys(values).sort() }
    } catch (error) {
      return { file: dotEnvFile(), exists, keys: [], error: describeError(error) }
    }
  }

  async function snapshot() {
    return {
      ok: true,
      version: VERSION,
      file: dataFile(),
      dotenv: await dotEnvSummary(),
      loadError: store.loadError,
      servers: store.servers.map(server => {
        const record = runtime.get(server.serverName)
        const status = !server.enabled
          ? 'disabled'
          : record?.status ?? 'stopped'
        return {
          ...server,
          status,
          tools: server.enabled ? record?.tools ?? countTools(server.serverName) : 0,
          error: record?.error ?? null,
          yaml: yamlFor(server),
        }
      }),
      external: externalRows(),
    }
  }

  async function save(input, originalName) {
    const server = parseServer(input)
    const previous = textOf(originalName)
    const index = store.servers.findIndex(entry => entry.serverName === server.serverName)
    if (previous && previous !== server.serverName) {
      throw failure('renaming a server is not supported; remove it and add a new one')
    }
    if (index === -1) {
      if (store.servers.some(entry => entry.serverName === server.serverName)) {
        throw failure(`server "${server.serverName}" already exists`)
      }
      store.servers.push(server)
    } else {
      store.servers[index] = server
    }
    await writeStore(store)
    await unmount(server.serverName)
    if (server.enabled) await mount(server)
    return snapshot()
  }

  async function remove(serverName) {
    const target = textOf(serverName)
    const index = store.servers.findIndex(entry => entry.serverName === target)
    if (index === -1) throw failure(`unknown server "${target}"`)
    store.servers.splice(index, 1)
    await writeStore(store)
    await unmount(target)
    return snapshot()
  }

  async function toggle(serverName, enabled) {
    const target = textOf(serverName)
    const server = store.servers.find(entry => entry.serverName === target)
    if (!server) throw failure(`unknown server "${target}"`)
    server.enabled = Boolean(enabled)
    await writeStore(store)
    if (server.enabled) await mount(server)
    else await unmount(server.serverName)
    return snapshot()
  }

  async function probe(input) {
    const server = parseServer(input)
    const probeName = `probe_${Math.random().toString(36).slice(2, 8)}`
    const started = Date.now()
    let module
    try {
      module = await loadMcpModule()
    } catch (error) {
      return { ok: false, error: describeError(error), ms: Date.now() - started }
    }
    let fiber
    try {
      const resolved = resolveServer(server, await environment())
      fiber = ctx.plugin(
        { name: 'mcp-client', apply: module.apply, Config: module.Config, inject: module.inject },
        clientConfig({ ...resolved, serverName: probeName }),
      )
      await withTimeout(fiber, CONNECT_TIMEOUT_MS, `connecting ${server.serverName}`)
      const prefix = `mcp__${probeName}__`
      const tools = ctx.tools
        .schemas()
        .filter(schema => typeof schema?.name === 'string' && schema.name.startsWith(prefix))
        .map(schema => schema.name.slice(prefix.length))
      return { ok: true, tools, ms: Date.now() - started }
    } catch (error) {
      return { ok: false, error: describeError(error), ms: Date.now() - started }
    } finally {
      if (fiber) {
        try {
          await fiber.dispose()
        } catch {
          /* inert already */
        }
      }
    }
  }

  /**
   * Normalize one pasted entry into the raw shape `parseServer` accepts.
   * Accepts the `{ type: "http" | "stdio", url | command, headers, env }`
   * spelling used by Claude Desktop / Cursor style JSON.
   */
  function normalizeImport(name, definition) {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
      throw failure('配置必须是对象')
    }
    const declared = String(definition.transport ?? definition.type ?? '').trim().toLowerCase()
    let transport
    if (declared === 'stdio') {
      transport = 'stdio'
    } else if (declared === '' || declared === 'http' || declared === 'streamable-http' || declared === 'streamablehttp') {
      transport = definition.command && !definition.url ? 'stdio' : 'streamable-http'
    } else if (declared === 'sse') {
      throw failure('SSE transport is not supported; use http (streamable-http) instead')
    } else {
      throw failure(`unsupported transport "${declared}"`)
    }
    const base = {
      serverName: textOf(definition.serverName) || String(name ?? '').trim(),
      transport,
      enabled: definition.enabled !== false && definition.disabled !== true,
      toolCallTimeoutMs: definition.toolCallTimeoutMs ?? definition.timeout,
    }
    if (transport === 'stdio') {
      return {
        ...base,
        command: definition.command,
        args: definition.args,
        cwd: definition.cwd ?? '',
        env: definition.env,
      }
    }
    return { ...base, url: definition.url, headers: definition.headers }
  }

  /** Read one pasted document into name/definition pairs. */
  function collectImport(text) {
    if (typeof text !== 'string' || !text.trim()) throw failure('paste a JSON document first')
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      throw failure(`JSON parse failed: ${describeError(error)}`)
    }
    let source = parsed
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      && parsed.mcpServers && typeof parsed.mcpServers === 'object' && !Array.isArray(parsed.mcpServers)) {
      source = parsed.mcpServers
    }
    const entries = []
    if (Array.isArray(source)) {
      source.forEach((definition, index) => {
        entries.push([definition?.serverName ?? definition?.name ?? `server-${index + 1}`, definition])
      })
    } else if (source && typeof source === 'object') {
      for (const [key, definition] of Object.entries(source)) {
        if (key === 'mcpServers' || key.startsWith('$') || key.startsWith('_')) continue
        entries.push([key, definition])
      }
    } else {
      throw failure('JSON must be an object like { "name": { ... } } or { "mcpServers": { ... } }')
    }
    return entries
  }

  /**
   * Upsert every pasted server, then connect the enabled ones in the
   * background. Per-entry failures do not abort the rest of the document.
   */
  async function importServers(text) {
    const entries = collectImport(text)
    if (!entries.length) throw failure('no servers found in the document')
    const results = []
    let changed = false
    for (const [name, definition] of entries) {
      try {
        const server = parseServer(normalizeImport(name, definition))
        const index = store.servers.findIndex(entry => entry.serverName === server.serverName)
        if (index === -1) {
          store.servers.push(server)
          results.push({ serverName: server.serverName, action: 'added', enabled: server.enabled })
        } else {
          store.servers[index] = server
          results.push({ serverName: server.serverName, action: 'updated', enabled: server.enabled })
        }
        changed = true
        await unmount(server.serverName)
      } catch (error) {
        results.push({ serverName: typeof name === 'string' ? name : String(name), action: 'failed', error: describeError(error) })
      }
    }
    if (changed) await writeStore(store)
    scheduleMounts()
    return { ok: true, version: VERSION, results, ...(await snapshot()) }
  }

  async function invoke(action, payload) {
    switch (action) {
      case 'list':
        await ensureLoaded()
        scheduleMounts()
        return snapshot()
      case 'save':
        await ensureLoaded()
        return save(payload?.server, payload?.originalName)
      case 'remove':
        await ensureLoaded()
        return remove(payload?.serverName)
      case 'toggle':
        await ensureLoaded()
        return toggle(payload?.serverName, payload?.enabled)
      case 'test':
        return probe(payload?.server)
      case 'import':
        await ensureLoaded()
        return importServers(payload?.text)
      case 'reload':
        store.loaded = false
        loadPromise = undefined
        await Promise.all([...runtime.values()].map(async record => {
          if (!record?.fiber) return
          try {
            await record.fiber.dispose()
          } catch {
            /* already gone */
          }
        }))
        runtime.clear()
        await ensureLoaded()
        await mountMissing()
        return snapshot()
      default:
        throw failure(`unknown action "${String(action)}"`)
    }
  }

  // ── HTTP route for the settings page ────────────────────────────────────
  function sendJson(res, status, value) {
    res.statusCode = status
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(value))
  }

  async function readJsonBody(req) {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > MAX_BODY_BYTES) throw failure('request body is too large')
      chunks.push(chunk)
    }
    if (!chunks.length) return {}
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      throw failure('request body must be JSON')
    }
  }

  ctx.inject(['webServer', 'connection'], webCtx => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: async (req, res) => {
        const rejection = webCtx.connection.requestRejection(req)
        if (rejection !== undefined) {
          sendJson(res, rejection, { ok: false, error: 'unauthorized' })
          return
        }
        const pathname = new URL(String(req.url), 'http://localhost').pathname
        const action = pathname.slice(API_PREFIX.length).replace(/^\/+/, '')
        try {
          if (action === 'list' || action === 'reload') {
            if (req.method !== 'GET' && req.method !== 'POST') {
              sendJson(res, 405, { ok: false, error: 'method not allowed' })
              return
            }
            // Reading never queues behind a slow connection attempt.
            sendJson(res, 200, await (action === 'list' ? invoke(action, {}) : serialized(() => invoke(action, {}))))
            return
          }
          if (!['save', 'remove', 'toggle', 'test', 'import'].includes(action)) {
            sendJson(res, 404, { ok: false, error: 'not found' })
            return
          }
          if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, error: 'method not allowed' })
            return
          }
          const body = await readJsonBody(req)
          sendJson(res, 200, await serialized(() => invoke(action, body)))
        } catch (error) {
          sendJson(res, error?.expose ? 400 : 500, { ok: false, error: describeError(error) })
        }
      },
    }), 'mcp-connect: settings API')
  })

  // ── Agent tool: the same operations, callable by the model ──────────────
  const tool = {
    name: 'mcp_servers',
    description:
      'Manage the MCP servers of this Harness installation: list configured servers and their connection status, '
      + 'add or update a server (stdio command or streamable HTTP URL), remove one, or test a definition '
      + 'before saving. Saved servers connect immediately and their tools appear as mcp__<serverName>__<tool>.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'save', 'remove', 'toggle', 'test', 'import', 'reload'],
          description: 'Operation to perform.',
        },
        server: {
          type: 'object',
          additionalProperties: true,
          description:
            'For save/test: { serverName, transport: "stdio" | "streamable-http", enabled?, '
            + 'command?, args?, cwd?, env?, url?, headers?, toolCallTimeoutMs? }.',
        },
        originalName: {
          type: 'string',
          description: 'For save: the server name being replaced, when it differs from server.serverName.',
        },
        serverName: {
          type: 'string',
          description: 'For remove/toggle: the target server name.',
        },
        enabled: {
          type: 'boolean',
          description: 'For toggle: whether the server should be connected.',
        },
        text: {
          type: 'string',
          description:
            'For import: a JSON document of one or more servers, either { "name": { ... } } or '
            + '{ "mcpServers": { ... } }. Entries accept { type: "http" | "stdio", url, headers, '
            + 'command, args, env, cwd } and may use ${VAR} placeholders resolved from ~/.dsh/.env.',
        },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render(_args, value) {
        return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
      },
    },
    async execute(args) {
      const action = String(args?.action ?? '')
      try {
        if (action === 'list') return await invoke('list', {})
        if (action === 'test') return await probe(args?.server)
        if (['save', 'remove', 'toggle', 'import', 'reload'].includes(action)) {
          return await serialized(() => invoke(action, args))
        }
        return { ok: false, error: `unknown action "${action}"` }
      } catch (error) {
        return { ok: false, error: describeError(error) }
      }
    },
  }
  try {
    ctx.effect(() => ctx.tools.register(tool), 'mcp-connect: tool')
  } catch (error) {
    ctx.logger?.warn?.(`mcp-connect: registering mcp_servers tool failed: ${describeError(error)}`)
  }

  // Connect saved servers in the background so neither Harness startup nor the
  // settings page waits on a slow MCP endpoint.
  scheduleMounts()
}
