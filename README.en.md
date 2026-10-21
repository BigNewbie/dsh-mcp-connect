# dsh-mcp-connect

Manage MCP servers for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) from the **Web settings page**: add, edit, test, import JSON in bulk, enable/disable, and remove servers. Saving connects immediately — no YAML editing and no restart.

[中文](README.md) · [MIT](LICENSE)

## Features

- **A settings page, not a YAML file** — an "MCP servers" section with live status, tool counts, and the failure reason on each card.
- **Both transports** — `streamable-http` (URL + headers) and `stdio` (command + args + env + cwd).
- **Test before saving** — the form performs a real connection and lists the server's tools first.
- **Bulk JSON import** — accepts the Claude Desktop / Cursor shape: a bare object, a `mcpServers` wrapper, or an array. Each entry reports added / updated / failed.
- **`${VAR}` placeholders** — expanded at connect time from `~/.dsh/.env` (a non-empty process variable of the same name wins). The registry stores the placeholder, so rotating a token only means editing `.env`.
- **Runtime mount** — save, disable, and delete take effect immediately; tools register as `mcp__<serverName>__<tool>` for every session.
- **Coexists with YAML** — MCP rows from configuration files are listed read-only so you can migrate them.
- **English and Chinese**, and it follows the DSH light/dark theme.
- **Ships a `mcp_servers` tool** — the model can add, remove, test, and import servers through the same operations.

## Install

Requires DeepSeek Harness `>= 0.2.0` with the Web UI (`dsh web`).

### Web plugin page (recommended)

Sidebar **Plugins** → **Install** → paste:

```
github:BigNewbie/dsh-mcp-connect
```

Refresh the page, then open **Settings → MCP servers**. The package ships a `dsh.bundle.patch`, so installation mounts it as a bundle automatically.

### Agent

```
plugin_manager install_bundle  target=github:BigNewbie/dsh-mcp-connect
```

### CLI + manual mount

```sh
dsh plugin --profile web add github:BigNewbie/dsh-mcp-connect
```

The CLI only installs the dependency; append this to `~/.dsh/profiles/web/cordis.patch.yml` and restart `dsh web`:

```yaml
- insert:
    - id: mcp-connect
      name: dsh-mcp-connect
```

### Uninstall

```
plugin_manager remove_bundle  target=dsh-mcp-connect
```

The definitions in `~/.dsh/mcp-servers.json` are kept.

## JSON import

Paste into **Import JSON**; all three shapes work:

```json
{
  "notes": {
    "type": "http",
    "url": "http://127.0.0.1:3000/mcp",
    "headers": { "Authorization": "Bearer ${NOTES_TOKEN}" }
  },
  "github": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
  }
}
```

`type` accepts `http`, `streamable-http`, and `stdio`; omitting it infers from `url` / `command`. `enabled: false` (or `disabled: true`) stores an entry without connecting. SSE is not supported by the official MCP client.

## Environment

Any string field can use `${VAR}`: `url`, `headers`, `env`, `args`, `command`, `cwd`. A missing variable fails with its name instead of sending the literal text.

`~/.dsh/.env`:

```sh
# comments and quotes are supported
NOTES_TOKEN=your-token
SEARCH_API_KEY="values with spaces or # need quotes"
```

The page shows the `.env` path and the number of variables (names only; values never leave the Host).

## Configuration file

`~/.dsh/mcp-servers.json`, shared by every profile:

```json
{
  "version": 1,
  "servers": [
    {
      "serverName": "notes",
      "transport": "streamable-http",
      "enabled": true,
      "toolCallTimeoutMs": 60000,
      "url": "http://127.0.0.1:3000/mcp",
      "headers": { "Authorization": "Bearer ${NOTES_TOKEN}" }
    }
  ]
}
```

## Security

- The management route is same-origin `/mcp-connect/api/*` and reuses DSH's Host/Origin and login checks; unauthenticated requests get 401.
- Adding a `stdio` server means running a local command. Do not expose `dsh web` to the public internet.
- `.env` values stay in the Host process; the API returns variable names only.
- Literal secrets also work but are written to `mcp-servers.json`; prefer `.env` + `${VAR}`.

## Limitations

- Tools only (same as the official `dsh-mcp-client`); MCP Resources and Prompts are not bridged.
- No SSE transport.
- One instance per `serverName`.
- A failed first connection is not retried forever; save again or press Reload.
- Import does not rewrite literal secrets into `${VAR}`.

## Publishing the repository

`YOUR_GITHUB` is a placeholder. After creating an empty repository with the same name:

```sh
node scripts/set-owner.mjs <your-github-user>
git add -A && git commit -m "chore: set repository owner"
git push -u origin main
```

## License

MIT © 2026 BigNewbie
