# Azure Functions MCP Server

A remote **MCP server** that runs as an **Azure Function**, using the official
Azure Functions **MCP extension** (`mcpToolTrigger`). Each decorated Python
function becomes one MCP tool. The Functions runtime exposes the MCP endpoint
for you — no transport code to write.

Pairs with the `client.mjs` in the repo root, which can connect to it remotely.

---

## Tools

| Tool      | Input            | Returns                                |
| --------- | ---------------- | -------------------------------------- |
| `hello`   | none             | A greeting string.                     |
| `get_sum` | `a`, `b` numbers | `"The sum of a and b is ..."`          |

---

## Files

| File                  | Purpose                                                        |
| --------------------- | ------------------------------------------------------------- |
| `function_app.py`     | The tools (one `mcpToolTrigger` per tool).                    |
| `host.json`           | Loads the **Preview** extension bundle (required for MCP).    |
| `requirements.txt`    | Python deps (`azure-functions`).                              |
| `local.settings.json` | Local-only settings (git-ignored, not deployed).             |
| `.funcignore`         | Files to skip when publishing.                                |

---

## Endpoint

Once deployed, MCP clients connect to:

```
https://<app-name>.azurewebsites.net/runtime/webhooks/mcp/sse?code=<mcp_extension-key>
```

The `code` is the `mcp_extension` **system key** (a secret). Get it with:

```bash
az functionapp keys list --name <app-name> --resource-group <rg> \
  --query "systemKeys.mcp_extension" -o tsv
```

---

## Connect with the repo's client

```bash
# from the repo root
node client.mjs "https://<app-name>.azurewebsites.net/runtime/webhooks/mcp/sse?code=<key>"
```

Then:

```
hello
get_sum {"a":21,"b":21}
quit
```

---

## Deploy from scratch

Prereqs: Azure CLI (`az`, logged in) and Azure Functions Core Tools v4 (`func`).

```bash
# Variables
RG=<your-resource-group>
ST=<storageaccountname>        # 3-24 lowercase letters/numbers, globally unique
APP=<function-app-name>        # globally unique
LOC=westeurope

# 1. Storage account (Functions needs one)
az storage account create -n $ST -g $RG -l $LOC --sku Standard_LRS

# 2. Function App (Flex Consumption, Python 3.11)
az functionapp create -n $APP -g $RG --storage-account $ST \
  --flexconsumption-location $LOC --runtime python --runtime-version 3.11 \
  --functions-version 4

# 3. Deploy the code (remote build)
func azure functionapp publish $APP --build remote
```

> **Note:** The MCP tool trigger is a **preview** feature. `host.json` must use
> `Microsoft.Azure.Functions.ExtensionBundle.Preview`. West Europe is a safe
> region for it.

---

## How it works

1. `host.json` loads the preview extension bundle → the runtime understands
   `mcpToolTrigger`.
2. Each `@app.generic_trigger(type="mcpToolTrigger", ...)` registers one MCP tool.
3. The runtime serves them at `/runtime/webhooks/mcp/sse` (SSE transport).
4. A client connects to that URL (with the system key) and calls the tools.

---

## Local run (optional)

```bash
func start
```

Needs a Python version the Functions runtime supports (3.11/3.12). The Azure
*deploy* uses Azure's own runtime, so local Python version doesn't affect it.
