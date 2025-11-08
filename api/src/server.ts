import express from "express";
import cors from "cors";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";

const app = express();
app.use(cors());
app.use(express.json());

let mcpClient: Client | null = null;

// Initialize MCP client connection
async function initializeMCP() {
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

const PORT = process.env.PORT || 3001;

// Start server first
app.listen(PORT, () => {
  console.log(`HTTP API running on port ${PORT}`);
});

// Then initialize MCP
initializeMCP().catch(console.error);