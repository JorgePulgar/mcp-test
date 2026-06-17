# Simple MCP Client

A tiny, well-commented **MCP (Model Context Protocol) client** written in Node.js.
It connects to **any** MCP server over stdio, lists the server's tools, and lets
you call them from a small interactive prompt.

Built as a class project: the goal is to show how an MCP client works, end to end,
in as few lines as possible.

---

## What is MCP?

MCP is a standard way for one program (the **client**) to talk to another (the
**server**) that exposes **tools** and **data**. Think of it like a universal
plugin protocol:

- The **client** asks: *"What tools do you have?"* and *"Run tool X with these args."*
- The **server** answers with results.

AI apps (like Claude) use MCP to safely call external tools. This project is a
minimal client that does the same thing by hand.

```
  you  ->  client.mjs  <-- stdio pipes -->  MCP server (child process)
                                            (tools: get-sum, echo, ...)
```

Everything runs **locally**. stdio = the server is a child process and messages
travel over standard input/output. No network involved.

---

## Setup

Requires Node.js 18+ (uses built-in ESM + `readline/promises`).

```bash
pnpm install
```

This installs the one dependency: `@modelcontextprotocol/sdk` (the official MCP SDK).

---

## Run

Point the client at any MCP server command. The easiest is the official demo
server, `server-everything`, which exposes example tools:

```bash
node client.mjs npx -y @modelcontextprotocol/server-everything
```

You'll see the tool list, then a prompt. Type calls, one per line:

```
get-sum {"a":21,"b":21}
echo {"message":"hello mcp"}
quit
```

Example output:

```
Result:
[
  {
    "type": "text",
    "text": "The sum of 21 and 21 is 42."
  }
]
```

### Input format

```
<tool-name> [JSON args]
```

- First word = tool name.
- Rest of the line = JSON arguments (or leave blank for none).
- `quit` (or `exit`) leaves the program.

---

## Connect to other servers

The client is generic — swap the server command for any stdio MCP server:

```bash
# Real filesystem server (read/list files under a path)
node client.mjs npx -y @modelcontextprotocol/server-filesystem C:\Users\You\Documents

# Your own server
node client.mjs node my-own-server.mjs
```

Same client, different server.

## Connect to a remote server (Azure Function)

The client also speaks to **remote** MCP servers over HTTP/SSE. If the first
argument is a URL, it uses the SSE transport instead of spawning a process:

```bash
node client.mjs "https://<app>.azurewebsites.net/runtime/webhooks/mcp/sse?code=<key>"
```

This repo includes one such server in **[`azure-mcp-server/`](azure-mcp-server/)** —
a Python MCP server deployed as an Azure Function via the official MCP extension.
See its README for tools, the endpoint, and deploy steps.

---

## How it works (5 steps)

The whole thing lives in `client.mjs` (~90 lines, heavily commented):

1. **Read args** — get the server command from the command line.
2. **Connect** — `StdioClientTransport` spawns the server; `client.connect()`
   runs the MCP handshake.
3. **List tools** — `client.listTools()` returns the server's tools; print them.
4. **REPL** — read a line, parse `<tool> {json}`, call `client.callTool()`,
   print the result.
5. **Cleanup** — `client.close()` shuts down the connection and child process.

---

## Files

| File           | Purpose                                       |
| -------------- | --------------------------------------------- |
| `client.mjs`   | The MCP client (all the logic + comments).    |
| `package.json` | Project metadata + the one dependency.        |
| `README.md`    | This file.                                    |

---

## Note (Windows)

Launch servers with `npx`, **not** `pnpm dlx`. A bare `pnpm` isn't resolved when
spawned without a shell, so the connection hangs. `npx` works.
