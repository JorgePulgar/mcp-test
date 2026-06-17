// =============================================================================
// Simple MCP (Model Context Protocol) client.
// =============================================================================
//
// WHAT IS MCP?
//   MCP is a standard way for a program (the "client", like this file or an AI
//   app) to talk to a "server" that exposes tools/data. The client asks the
//   server "what tools do you have?" and "please run tool X with these args",
//   and the server answers. Same idea as a plugin system, but standardized.
//
// WHAT DOES THIS CLIENT DO?
//   1. Spawns the MCP server you point it at (as a child process).
//   2. Connects to it over "stdio" (standard input/output pipes -- no network).
//   3. Does the MCP handshake so both sides agree on the protocol.
//   4. Asks the server for its list of tools and prints them.
//   5. Opens a tiny REPL (read-eval-print loop) so you can type tool calls.
//
// USAGE:
//   node client.mjs <server-command> [args...]
//
// EXAMPLES:
//   node client.mjs npx -y @modelcontextprotocol/server-everything
//   node client.mjs node my-own-server.mjs
//
// =============================================================================

// --- Imports -----------------------------------------------------------------

// Client       = the main MCP client object. Handles the protocol for us.
// StdioClientTransport = the "pipe" layer for LOCAL servers. It spawns the
//                        server process and talks over stdin/stdout.
// SSEClientTransport   = the layer for REMOTE servers over HTTP (e.g. our
//                        Azure Function). Connects to a URL instead of a process.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

// readline/promises = Node's built-in tool for reading user input line by line.
// stdin/stdout      = this program's own input/output streams (the terminal).
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

// --- 1. Read the server command from the command line ------------------------

// process.argv = ["node", "client.mjs", <server-command>, ...args].
// slice(2) drops the first two and leaves just what the user typed after the
// script name, e.g. ["npx", "-y", "@modelcontextprotocol/server-everything"].
const argv = process.argv.slice(2);

// No server command given? Print help and quit with a non-zero exit code.
if (argv.length === 0) {
  console.error("Usage:");
  console.error("  Local server : node client.mjs <command> [args...]");
  console.error("  Remote server: node client.mjs <https://.../sse-url>");
  console.error("");
  console.error("Examples:");
  console.error("  node client.mjs npx -y @modelcontextprotocol/server-everything");
  console.error("  node client.mjs https://my-app.azurewebsites.net/runtime/webhooks/mcp/sse?code=KEY");
  process.exit(1);
}

// --- 2. Pick a transport and connect -----------------------------------------

// Decide LOCAL vs REMOTE from the first argument. A URL -> remote (HTTP/SSE);
// anything else -> a local command we spawn.
const first = argv[0];
const isUrl = first.startsWith("http://") || first.startsWith("https://");

let transport;
if (isUrl) {
  // REMOTE: connect to the server's SSE endpoint over HTTP. No process spawned.
  transport = new SSEClientTransport(new URL(first));
  console.log(`Connecting to (remote): ${first}`);
} else {
  // LOCAL: spawn `command args...` as a child process and talk over stdio.
  const command = first;
  const args = argv.slice(1);
  transport = new StdioClientTransport({ command, args });
  console.log(`Connecting to (local): ${command} ${args.join(" ")}`);
}

// Our own identity. The server may log this. Name/version are arbitrary.
const client = new Client({ name: "mcp-test-client", version: "1.0.0" });

// connect() launches the server and runs the MCP handshake. `await` because it
// is async (network/process I/O). After this line we are connected.
await client.connect(transport);
console.log("Connected.\n");

// --- 3. Ask the server which tools it has ------------------------------------

// listTools() returns an object like { tools: [ {name, description, ...}, ... ] }.
// Destructure out just the `tools` array.
const { tools } = await client.listTools();

if (tools.length === 0) {
  console.log("Server exposes no tools.");
} else {
  console.log("Available tools:");
  for (const t of tools) {
    // `?? ""` = use empty string if description is missing (null/undefined).
    console.log(`  - ${t.name}: ${t.description ?? ""}`);
  }
}
console.log("");

// --- 4. REPL: let the user call tools ----------------------------------------
//
// Input format is ONE line per call:  <tool-name> [JSON args]
//   echo {"message":"hi"}
//   get-sum {"a":21,"b":21}
//   quit            <- exits
//
// (We use one line instead of two separate prompts because reading multiple
//  prompts from a piped/scripted stdin can drop lines. One line is robust.)

const rl = readline.createInterface({ input: stdin, output: stdout });
console.log('Call a tool:  <tool-name> [JSON args]   (or "quit" to exit)');
console.log('Example: get-sum {"a":21,"b":21}\n');

// for-await over `rl` yields each line the user types, one at a time.
for await (const line of rl) {
  const input = line.trim();

  if (input === "") continue;                       // blank line -> ignore
  if (input === "quit" || input === "exit") break;  // leave the loop -> cleanup

  // Split the line into the tool name (first word) and the rest (JSON args).
  // indexOf(" ") finds the first space; -1 means there was no space at all.
  const space = input.indexOf(" ");
  const name = space === -1 ? input : input.slice(0, space);
  const rawArgs = space === -1 ? "" : input.slice(space + 1).trim();

  // Make sure the server actually has a tool with this name.
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    console.log(`No tool named "${name}". Try again.`);
    continue;
  }

  // Parse the JSON args. No args given -> use an empty object {}.
  let toolArgs = {};
  if (rawArgs !== "") {
    try {
      toolArgs = JSON.parse(rawArgs);
    } catch (e) {
      console.log(`Bad JSON: ${e.message}`);
      continue;
    }
  }

  // Run the tool on the server and print whatever it returns.
  // result.content is an array of items, usually { type: "text", text: "..." }.
  try {
    const result = await client.callTool({ name, arguments: toolArgs });
    console.log("Result:");
    console.log(JSON.stringify(result.content, null, 2), "\n");
  } catch (e) {
    // The tool ran but errored (bad args, server problem, etc.).
    console.log(`Tool error: ${e.message}\n`);
  }
}

// --- 5. Clean up -------------------------------------------------------------

rl.close();          // stop reading terminal input
await client.close(); // close the MCP connection and the server child process
console.log("Disconnected.");
process.exit(0);      // exit cleanly
