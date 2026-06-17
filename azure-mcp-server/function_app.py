# =============================================================================
# MCP server running inside an Azure Function.
# =============================================================================
#
# This uses the OFFICIAL Azure Functions MCP extension. Instead of us wiring up
# an HTTP/SSE transport by hand, the Functions runtime exposes an MCP endpoint
# automatically. Each function decorated with `mcpToolTrigger` becomes one MCP
# tool that remote MCP clients (like our client.mjs, or Claude) can call.
#
# Once deployed, clients connect to:
#   https://<your-app>.azurewebsites.net/runtime/webhooks/mcp/sse
#
# Each tool below shows the pattern: declare its input properties, then return
# a string result.
# =============================================================================

import json
import azure.functions as func

# The function app. All triggers attach to this object.
app = func.FunctionApp()


# --- Helper: describe one input property of a tool ---------------------------
# The MCP extension wants tool inputs described as JSON. This small class just
# lets us build that JSON cleanly instead of writing it by hand.
class ToolProperty:
    def __init__(self, property_name: str, property_type: str, description: str):
        self.propertyName = property_name   # name the client passes
        self.propertyType = property_type   # "string" | "number" | ...
        self.description = description       # human-readable hint


# =============================================================================
# Tool 1: hello  -- takes no input, returns a greeting.
# =============================================================================
@app.generic_trigger(
    arg_name="context",          # the runtime passes call info as `context`
    type="mcpToolTrigger",       # <- this makes it an MCP tool
    toolName="hello",            # name clients see / call
    description="Returns a friendly greeting from Azure Functions.",
    toolProperties="[]",         # no inputs
)
def hello(context) -> str:
    return "Hello, MCP! This server runs on an Azure Function."


# =============================================================================
# Tool 2: get_sum  -- takes two numbers, returns their sum.
# =============================================================================

# Describe the two inputs, then serialize the list to JSON for the trigger.
_get_sum_props = json.dumps([
    vars(ToolProperty("a", "number", "First number.")),
    vars(ToolProperty("b", "number", "Second number.")),
])


@app.generic_trigger(
    arg_name="context",
    type="mcpToolTrigger",
    toolName="get_sum",
    description="Returns the sum of two numbers, a and b.",
    toolProperties=_get_sum_props,
)
def get_sum(context) -> str:
    # `context` arrives as a JSON string. The caller's arguments live under
    # the "arguments" key.
    payload = json.loads(context)
    args = payload.get("arguments", {})
    a = args.get("a", 0)
    b = args.get("b", 0)
    return f"The sum of {a} and {b} is {a + b}."
