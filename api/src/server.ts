import express from "express";
import cors from "cors";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();
import { spawn } from "child_process";

const app = express();
app.use(cors());
app.use(express.json());

let mcpClient: Client | null = null;

// Initialize MCP client connection
async function initializeMCP() {

  console.log("ENV CHECK:", {
    hasFlightAware: !!process.env.FLIGHTAWARE_API_KEY,
    hasSupabaseUrl: !!process.env.SUPABASE_URL,
    hasSupabaseKey: !!process.env.SUPABASE_SERVICE_KEY
  });

  const transport = new StdioClientTransport({
    command: "node",
    args: ["../mcp-server/dist/index.js"],
    env: {
      ...process.env,
      FLIGHTAWARE_API_KEY: process.env.FLIGHTAWARE_API_KEY || '',
      SUPABASE_URL: process.env.SUPABASE_URL || '',
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || '',
    },
  });

  mcpClient = new Client(
    {
      name: "skysync-http-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  await mcpClient.connect(transport);
  console.log("Connected to MCP server");
}

// Tool calling endpoint
app.post("/tools/:toolName", async (req, res) => {
  console.log("Received request:", req.params.toolName, req.body);
  
  if (!mcpClient) {
    return res.status(503).json({ error: "MCP client not ready" });
  }
  
  try {
    const { toolName } = req.params;
    const args = req.body;

    console.log("Calling MCP tool...");
    const result = await mcpClient.callTool({
      name: toolName,
      arguments: args,
    });

    console.log("Got result:", result);
    res.json(result);
  } catch (error: any) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Resource reading endpoint
app.get("/resources", async (req, res) => {
  if (!mcpClient) {
    return res.status(503).json({ error: "MCP client not ready" });
  }
  
  try {
    const uri = req.query.uri as string;

    if (!uri) {
      return res.status(400).json({ error: "uri query parameter required" });
    }

    const result = await mcpClient.readResource({ uri });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get("/health", (req, res) => {
  console.log("Health check hit");
  res.json({ status: "ok" });
});
// User context webhook
app.get("/api/user-context/:phone_number", async (req, res) => {
  const { phone_number } = req.params;

  console.log("Looking for phone:", phone_number);

  // We need to import and initialize Supabase here
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || ''
  );

  // Find user
  const { data: users, error } = await supabase
    .from("users")
    .select("*")
    .eq("phone_number", phone_number);
  
  const user = users?.[0];

  if (!user) {
    return res.json({
      caller_name: "there",
      phone_number: phone_number,
      flight_number: "",
      origin: "",
      destination: "",
      departure_time: "",
      home_airport: ""
    });
  }

  // Find their next flight
  const { data: flight, error: flightError } = await supabase
    .from("user_flights")
    .select("*")
    .eq("user_id", user.id)
    .gte("flight_date", new Date().toISOString().split("T")[0])
    .order("flight_date", { ascending: true })
    .limit(1)
    .single();

  return res.json({
    caller_name: user.name,
    phone_number: phone_number,
    flight_number: flight?.flight_number || "",
    origin: flight?.origin || "",
    destination: flight?.destination || "",
    departure_time: flight?.departure_time || "",
    home_airport: user.home_airport
  });
});

// Dynamic webhook for Telnyx
// Dynamic webhook for Telnyx
// Dynamic webhook for Telnyx
// Dynamic webhook for Telnyx
app.post("/api/user-context", async (req, res) => {
  const startTime = Date.now();
  const phone_number = req.body?.data?.payload?.telnyx_end_user_target;
  
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || ''
  );

  // Single query with join
  const { data: users } = await supabase
    .from("users")
    .select(`
      *,
      user_flights!inner(*)
    `)
    .eq("phone_number", phone_number)
    .gte("user_flights.flight_date", new Date().toISOString().split("T")[0])
    .order("user_flights.flight_date", { ascending: true })
    .limit(1);
  
  const user = users?.[0];
  const flight = user?.user_flights?.[0];

  const response = {
    dynamic_variables: {
      caller_name: user?.name || "there",
      flight_number: flight?.flight_number || "",
      origin: flight?.origin || "",
      destination: flight?.destination || "",
      departure_time: flight?.departure_time || "",
      home_airport: user?.home_airport || ""
    }
  };
  
  console.log("Response time:", Date.now() - startTime, "ms");
  return res.json(response);
});
const PORT = process.env.PORT || 3002;

// Start server first
app.listen(PORT, () => {
  console.log(`HTTP API running on port ${PORT}`);
});

// Then initialize MCP
initializeMCP().catch(console.error);