# dsh-mcp-connect

在 DeepSeek Harness 的 **Web 设置页**里管理 MCP 服务器：添加、编辑、测试连接、批量导入 JSON、启用/停用、删除。保存即连接，不用手写 `cordis.patch.yml`，也不用重启 Harness。

[English](README.en.md) · [MIT](LICENSE)

## 功能

- **设置页里的管理界面** — 「MCP 服务器」页面独立成节，卡片显示实时状态、工具数量和失败原因。
- **两种传输** — `streamable-http`（URL + 请求头）与 `stdio`（命令 + 参数 + 环境变量 + 工作目录）。
- **先测后存** — 表单里「测试连接」会真的连一次并列出服务端工具，确认无误再保存。
- **JSON 批量导入** — 兼容 Claude Desktop / Cursor 的写法：裸对象、外层带 `mcpServers`、或数组；逐条返回新增/更新/失败原因。
- **`${VAR}` 占位符** — 连接时从 `~/.dsh/.env` 展开（进程环境里的非空同名变量优先）。注册表只保存占位符原文，换 token 只需改 `.env`。
- **运行时挂载** — 保存、停用、删除立即生效；工具以 `mcp__<serverName>__<tool>` 注册给所有会话。
- **和 YAML 共存** — 配置文件里已有的 MCP 行会以只读卡片列出，方便迁移。
- **中英双语**，跟随 DSH 的浅色/深色主题。
- **附带 `mcp_servers` 工具** — 模型可以用同一套操作帮你加、删、测、导入服务器。

## 安装

前提：DeepSeek Harness `>= 0.2.0`，且使用 Web 界面（`dsh web`）。

### 方式一：Web 插件页（推荐）

侧栏 **Plugins** → **Install** → 粘贴：

```
github:BigNewbie/dsh-mcp-connect
```

安装完成后刷新页面，打开 **设置 → MCP 服务器**。本包带 `dsh.bundle.patch`，安装时会自动作为 bundle 挂载，不需要手改 YAML。

### 方式二：让 agent 装

```
plugin_manager install_bundle  target=github:BigNewbie/dsh-mcp-connect
```

### 方式三：CLI + 手动挂载

```sh
dsh plugin --profile web add github:BigNewbie/dsh-mcp-connect
```

CLI 只把包装进 profile，不会选中 bundle；在 `~/.dsh/profiles/web/cordis.patch.yml` 末尾追加：

```yaml
- insert:
    - id: mcp-connect
      name: dsh-mcp-connect
```

然后重启 `dsh web`。

### 卸载

```
plugin_manager remove_bundle  target=dsh-mcp-connect
```

或在插件页停用/移除。定义文件 `~/.dsh/mcp-servers.json` 不会被删除。

## 使用

打开 **设置 → MCP 服务器**：

- **添加服务器**：选传输方式填表；`serverName` 只允许字母、数字、`_`、`-`，最长 32 位，会成为工具名的前缀。
- **测试连接**：不保存也能先试，成功会列出工具。
- **启用/停用**：停用立即断开并卸载工具。
- **编辑**：原地热更新连接，`serverName` 不可改（改名请删除后重建）。
- **查看 YAML**：显示这个服务器等价的 YAML 行，方便手工迁移。
- **删除**：二次确认。

### 状态

| 状态 | 含义 |
| --- | --- |
| 已连接 · N 个工具 | 会话里已经能调用 `mcp__<name>__*` |
| 连接中… | 正在握手或重连 |
| 连接失败 | 首次连接失败，卡片显示原因（含缺失的环境变量名） |
| 已停用 | 不连接、不注册工具 |

## JSON 导入

粘贴到「导入 JSON」，支持三种写法：

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

- `type` 可以是 `http`、`streamable-http`、`stdio`；省略时按有没有 `url`/`command` 推断。
- 也接受 `{ "mcpServers": { ... } }` 和数组形式。
- `enabled: false` 或 `disabled: true` 表示只保存不连接。
- 同名条目按「更新」处理，一条失败不影响其余条目。
- `sse` 传输不受支持（官方 MCP 客户端只支持 stdio 与 streamable HTTP）。

## 环境变量

定义里任何字符串字段都能写 `${VAR}`：`url`、`headers`、`env`、`args`、`command`、`cwd`。

优先级：**进程环境里的非空同名变量** > `~/.dsh/.env`。变量缺失会明确报错，不会把 `${VAR}` 原样发给服务器。

`~/.dsh/.env` 示例：

```sh
# 注释
NOTES_TOKEN=你的 token
SEARCH_API_KEY="带空格或 # 的值请加引号"
```

设置页顶部会显示 `.env` 路径和变量个数（只显示名字，值不会离开 Host）。改完 `.env` 后点「重新加载」即可让新值生效。

## 配置文件

`~/.dsh/mcp-servers.json`（所有 profile 共用）：

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

文件由本插件维护，一般不用手改；要手改的话改完点「重新加载」。

## 安全说明

- 管理接口走同源 `/mcp-connect/api/*`，复用 DSH 的 Host/Origin 与登录态校验；未登录请求返回 401。
- 能添加 `stdio` 服务器等于能在本机执行任意命令。不要把 `dsh web` 暴露到公网；默认只监听回环地址时风险可控。
- `.env` 的值只留在 Host 进程里，接口只返回变量名，绝不返回值。
- 明文 token 也可以直接写在定义里，但它会存进 `mcp-servers.json`；更推荐 `.env` + `${VAR}`。

## 已知限制

- 仅桥接 MCP tools（与官方 `dsh-mcp-client` 一致），Resources / Prompts 不暴露给模型。
- `sse` 传输不支持。
- 一个 `serverName` 只能有一个实例；同名会拒绝。
- 首次连接失败不会自动无限重试；改好配置保存或点「重新加载」重连。
- 导入时不会自动把明文密钥改写成 `${VAR}`。

## 开发

本仓库根目录就是 bundle，无构建步骤：

```sh
git clone https://github.com/BigNewbie/dsh-mcp-connect.git
cd dsh-mcp-connect
# 用 plugin_manager install_bundle 指向本目录，或以目录方式 add 到 profile
```

改 Host 半（`index.js`）后要让 profile 重新组合一次（插件页关开该行）；改浏览器半（`client.js`）刷新页面即可。

### 发布到 GitHub

仓库里的 `YOUR_GITHUB` 是占位符。创建同名空仓库后执行一次：

```sh
node scripts/set-owner.mjs <你的GitHub用户名>
git add -A && git commit -m "chore: set repository owner"
git push -u origin main
```

脚本会改写 `package.json` 的 repository/homepage/bugs、两份 README 的安装命令，并把 `origin` 指到对应仓库。

## License

MIT © 2026 BigNewbie
