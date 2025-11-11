import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../../public')));

// ---- Supabase (single instance) ----
const supabase = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_KEY ?? ""
);

// ---- MCP setup ----
let mcpClient: Client | null = null;

const MCP_COMMAND = process.env.MCP_COMMAND ?? "node";
const MCP_ARGS = process.env.MCP_ARGS
  ? JSON.parse(process.env.MCP_ARGS)
  : ["../mcp-server/dist/index.js"];

function normalizeToolResult(result: any) {
  if (!result) return result;
  if (Array.isArray(result.content)) {
    try {
      return result.content.map((c: any) =>
        typeof c.text === "string" ? c.text : JSON.stringify(c)
      ).join("");
    } catch {
      return result;
    }
  }
  return result;
}

async function initializeMCP() {
  console.log("ENV CHECK:", {
    hasFlightAware: !!process.env.FLIGHTAWARE_API_KEY,
    hasSupabaseUrl: !!process.env.SUPABASE_URL,
    hasSupabaseKey: !!process.env.SUPABASE_SERVICE_KEY
  });

  const transport = new StdioClientTransport({
    command: MCP_COMMAND,
    args: MCP_ARGS,
    env: {
      ...process.env,
      FLIGHTAWARE_API_KEY: process.env.FLIGHTAWARE_API_KEY ?? "",
      SUPABASE_URL: process.env.SUPABASE_URL ?? "",
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ?? "",
    },
  });

  mcpClient = new Client(
    { name: "skysync-http-client", version: "1.0.0" },
    { capabilities: {} }
  );

  await mcpClient.connect(transport);
  console.log("Connected to MCP server");
}

// ---- Simple bearer auth for sensitive routes ----
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.INTERNAL_BEARER;
  if (!expected) return next();
  const got = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (got !== expected) return res.status(401).json({ error: "unauthorized" });
  next();
}

// Registration endpoint
app.post('/api/register', async (req, res) => {
  try {
    const { phone_number, name, email, home_airport } = req.body;

    if (!phone_number || !name || !email || !home_airport) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!phone_number.startsWith('+')) {
      return res.status(400).json({ error: 'Phone number must include country code' });
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('phone_number', phone_number)
      .maybeSingle();

    if (existingUser) {
      // Update existing user
      const { error: updateError } = await supabase
        .from('users')
        .update({ name, email, home_airport })
        .eq('phone_number', phone_number);

      if (updateError) {
        return res.status(500).json({ error: 'Failed to update user' });
      }

      return res.json({ success: true, message: 'User updated successfully' });
    }

    // Create new user
    const { data, error: insertError } = await supabase
      .from('users')
      .insert([{ phone_number, name, email, home_airport }])
      .select();

    if (insertError) {
      return res.status(500).json({ error: 'Failed to create user' });
    }

    res.json({ success: true, message: 'User registered successfully', user: data[0] });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Serve landing page at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

// ---- Routes ----
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", mcpReady: !!mcpClient });
});

app.get("/tools", requireAuth, async (_req: Request, res: Response) => {
  if (!mcpClient) return res.status(503).json({ error: "MCP client not ready" });
  try {
    const result = await mcpClient.listTools();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /tools - MCP endpoint for listing and calling tools
app.post("/tools", requireAuth, async (req: Request, res: Response) => {
  console.log("POST /tools received:", JSON.stringify(req.body, null, 2));
  
  if (!mcpClient) {
    return res.status(503).json({ 
      jsonrpc: "2.0", 
      id: req.body?.id, 
      error: { code: -32000, message: "MCP client not ready" }
    });
  }
  
  const { method, params, id } = req.body ?? {};
  
  try {

    if (method === "initialize") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2025-06-18",
          serverInfo: {
            name: "skysync-mcp-server",
            version: "1.0.0"
          },
          capabilities: {
            tools: {}
          }
        }
      });
    }

    if (method === "notifications/initialized" || method?.startsWith("notifications/")) {
      return res.status(200).json({});
    }

    if (method === "tools/list" || method === "list") {
      const result = await mcpClient.listTools();
      return res.json({ jsonrpc: "2.0", id, result });
    }
    
    if (method === "tools/call" || method === "call") {
      if (!params?.name) {
        return res.status(400).json({ 
          jsonrpc: "2.0", 
          id, 
          error: { code: -32602, message: "Invalid params: name required" }
        });
      }
      const result = await mcpClient.callTool({ 
        name: params.name, 
        arguments: params.arguments ?? {} 
      });
      return res.json({ jsonrpc: "2.0", id, result});
    }
    
    return res.status(400).json({ 
      jsonrpc: "2.0", 
      id, 
      error: { code: -32601, message: `Method not found: ${method}` }
    });
  } catch (e: any) {
    console.error("POST /tools error:", e);
    return res.status(500).json({ 
      jsonrpc: "2.0", 
      id, 
      error: { code: -32000, message: e.message }
    });
  }
});

app.post("/tools/:toolName", requireAuth, async (req: Request, res: Response) => {
  if (!mcpClient) return res.status(503).json({ error: "MCP client not ready" });
  try {
    const result = await mcpClient.callTool({
      name: req.params.toolName,
      arguments: req.body ?? {},
    });
    res.json({ result: normalizeToolResult(result) });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/resources", requireAuth, async (req: Request, res: Response) => {
  if (!mcpClient) return res.status(503).json({ error: "MCP client not ready" });
  const uri = String(req.query.uri ?? "");
  if (!uri) return res.status(400).json({ error: "uri query parameter required" });
  try {
    const result = await mcpClient.readResource({ uri });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// JSON-RPC 2.0 shim (for Telnyx MCP)
app.post("/mcp", requireAuth, async (req: Request, res: Response) => {
  const { method, params, id } = req.body ?? {};
  if (!mcpClient) {
    return res.status(503).json({ jsonrpc: "2.0", id, error: { code: -32000, message: "MCP client not ready" }});
  }
  try {
    if (method === "tools/list") {
      const result = await mcpClient.listTools();
      return res.json({ jsonrpc: "2.0", id, result });
    }
    if (method === "tools/call") {
      if (!params?.name) return res.status(400).json({ jsonrpc: "2.0", id, error: { code: -32602, message: "Invalid params" }});
      const result = await mcpClient.callTool({ name: params.name, arguments: params.arguments ?? {} });
      return res.json({ jsonrpc: "2.0", id, result: normalizeToolResult(result) });
    }
    return res.status(400).json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" }});
  } catch (e: any) {
    console.error("MCP endpoint error:", e);
    res.status(500).json({ jsonrpc: "2.0", id, error: { code: -32000, message: e.message }});
  }
});

// User context (GET)
app.get("/api/user-context/:phone_number", requireAuth, async (req: Request, res: Response) => {
  const { phone_number } = req.params;
  const { data: users } = await supabase
    .from("users")
    .select("*")
    .eq("phone_number", phone_number)
    .limit(1);
  const user = users?.[0];
  if (!user) {
    return res.json({ caller_name: "there", phone_number, flight_number: "", origin: "", destination: "", departure_time: "", home_airport: "" });
  }
  const { data: flight } = await supabase
    .from("user_flights")
    .select("*")
    .eq("user_id", user.id)
    .gte("flight_date", new Date().toISOString().slice(0,10))
    .order("flight_date", { ascending: true })
    .limit(1)
    .single();
  return res.json({
    caller_name: user.name,
    phone_number,
    flight_number: flight?.flight_number ?? "",
    origin: flight?.origin ?? "",
    destination: flight?.destination ?? "",
    departure_time: flight?.departure_time ?? "",
    home_airport: user.home_airport ?? ""
  });
});

// Dynamic variables (POST)
app.post("/api/user-context", requireAuth, async (req: Request, res: Response) => {
  const start = Date.now();
  const body = req.body ?? {};
  const payload = body.data?.payload ?? body.payload ?? {};
  const phone_number =
    payload.telnyx_end_user_target ??
    payload.from?.number ?? payload.from ??
    payload.to?.number ?? payload.to ?? null;

  console.log(`[${Date.now()}] Webhook called for: ${phone_number}`);

  if (!phone_number) {
    console.log("No phone number, returning default");
    return res.json({ dynamic_variables: { caller_name: "there" }});
  }

  const queryStart = Date.now();
  const { data: user } = await supabase
    .from("users")
    .select("name, home_airport, email")
    .eq("phone_number", phone_number)
    .maybeSingle();
  
  console.log(`Query took: ${Date.now() - queryStart}ms`);

  
  
  const response = {
    dynamic_variables: {
      caller_name: user?.name || "there",
      home_airport: user?.home_airport ?? "",
      user_email: user?.email ?? "" 
    }
  };

  console.log(`Total time: ${Date.now() - start}ms, responding now`);
  return res.json(response);
});

// Start
const PORT = process.env.PORT ?? 3002;
app.listen(PORT, () => console.log(`HTTP API on :${PORT}`));
initializeMCP().catch(console.error);