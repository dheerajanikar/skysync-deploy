#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

import { DateTime } from 'luxon';
const AIRPORT_TIMEZONES: Record<string, string> = {
  'SFO': 'America/Los_Angeles', 'LAX': 'America/Los_Angeles',
  'SAN': 'America/Los_Angeles', 'SEA': 'America/Los_Angeles',
  'PDX': 'America/Los_Angeles', 'LAS': 'America/Los_Angeles',
  'OAK': 'America/Los_Angeles', 'SJC': 'America/Los_Angeles',
  'DEN': 'America/Denver', 'SLC': 'America/Denver',
  'PHX': 'America/Phoenix',
  'DFW': 'America/Chicago', 'ORD': 'America/Chicago',
  'IAH': 'America/Chicago', 'MSP': 'America/Chicago',
  'JFK': 'America/New_York', 'LGA': 'America/New_York',
  'EWR': 'America/New_York', 'BOS': 'America/New_York',
  'ATL': 'America/New_York', 'MIA': 'America/New_York',
  'IAD': 'America/New_York', 'DCA': 'America/New_York',
};

class SkySyncMCPServer {
  private server: Server;
  private supabase;
  private flightAwareApiKey: string;
  private flightAwareBaseUrl: string = "https://aeroapi.flightaware.com/aeroapi";


  constructor() {

    this.supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );

    this.flightAwareApiKey = process.env.FLIGHTAWARE_API_KEY!;
    this.server = new Server(
      {
        name: "skysync-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
          {
            name: "get_flight_status",
            description: "Get real-time status of a specific flight",
            inputSchema: {
              type: "object",
              properties: {
                airline_code: {
                  type: "string",
                  description: "Two-letter airline code (e.g., 'DL', 'AA')",
                },
                flight_number: {
                  type: "string",
                  description: "Flight number (e.g., '1234')",
                },
              },
              required: ["airline_code", "flight_number"],
            },
          },
          {
            name: "search_flights_by_route",
            description: "Search for flights between two airports",
            inputSchema: {
              type: "object",
              properties: {
                origin: {
                  type: "string",
                  description: "Origin airport code (e.g., 'LAX')",
                },
                destination: {
                  type: "string",
                  description: "Destination airport code (e.g., 'JFK')",
                },
              },
              required: ["origin", "destination"],
            },
          },
          {
            name: "log_user_query",
            description: "Log user's flight query to database",
            inputSchema: {
              type: "object",
              properties: {
                user_phone: {
                  type: "string",
                  description: "User's phone number",
                },
                query: {
                  type: "string",
                  description: "The query text",
                },
                flight_info: {
                  type: "string",
                  description: "Flight information as JSON string",
                },
              },
              required: ["user_phone", "query"],
            },
          },
          {
            name: "send_flight_sms",
            description: "Send flight information via SMS to the user",
            inputSchema: {
              type: "object",
              properties: {
                phone_number: {
                  type: "string",
                  description: "User's phone number in E.164 format",
                },
                message: {
                  type: "string",
                  description: "Flight details to send via SMS",
                },
              },
              required: ["phone_number", "message"],
            },
          },
        ],
      }));

      // Execute tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
    
        try {
        switch (name) {
            case "get_flight_status":
            return await this.getFlightStatus(args);
            case "search_flights_by_route":
            return await this.searchFlightsByRoute(args);
            case "log_user_query":
            return await this.logUserQuery(args);
            case "send_flight_sms":  // ADD THIS CASE
            return await this.sendFlightSms(args);
            default:
            throw new Error(`Unknown tool: ${name}`);
        }
        } catch (error: any) {
        return {
            content: [
            {
                type: "text",
                text: JSON.stringify({ error: error.message }),
            },
            ],
        };
        }
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
        resources: [
        {
            uri: "flight://history/{user_phone}",
            name: "User Flight History",
            description: "Past flight queries for a specific user",
            mimeType: "application/json",
        },
        ],
    }));
  
    // Read specific resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const { uri } = request.params;
    
        if (uri.startsWith("flight://history/")) {
        const userPhone = uri.replace("flight://history/", "");
        return await this.getUserFlightHistory(userPhone);
        }
    
    
        throw new Error(`Unknown resource: ${uri}`);
    });

    // List available prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
        prompts: [
        {
            name: "flight_assistant",
            description: "System prompt for flight status assistant",
            arguments: [
            {
                name: "user_name",
                description: "User's name if known",
                required: false,
            },
            ],
        },
        ],
    }));
  
  // Get specific prompt
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
    
        if (name === "flight_assistant") {
        const userName = args?.user_name || "traveler";
        return {
            messages: [
            {
                role: "user",
                content: {
                type: "text",
                text: `You are SkySync, a helpful flight status assistant. Greet ${userName} warmly and help them check flight statuses, search routes, and get airport information. Be concise and friendly.`,
                },
            },
            ],
        };
        }
    
        throw new Error(`Unknown prompt: ${name}`);
    });

    
      
  }

  // ADD THIS METHOD - it was missing!
  private async getFlightStatus(args: any) {
    const { airline_code, flight_number } = args;
    const flightIdent = `${airline_code}${flight_number}`;

    try {
      const response = await axios.get(
        `${this.flightAwareBaseUrl}/flights/${flightIdent}`,
        {
          headers: {
            "x-apikey": this.flightAwareApiKey,
          },
          params: {
            max_pages: 1,
          },
        }
      );

      const flights = response.data.flights || [];
      if (flights.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Flight not found",
                flight: flightIdent,
              }),
            },
          ],
        };
      }

      const flight = flights[0];
      const flightInfo = {
        ident: flight.ident,
        status: flight.status,
        origin: flight.origin?.code_iata || flight.origin?.code,
        destination: flight.destination?.code_iata || flight.destination?.code,
        scheduled_departure: flight.scheduled_off,
        scheduled_arrival: flight.scheduled_on,
        actual_departure: flight.actual_off,
        estimated_arrival: flight.estimated_on,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(flightInfo, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: `FlightAware API error: ${error.message}`,
            }),
          },
        ],
      };
    }
  }

  private async searchFlightsByRoute(args: any) {
    const { origin, destination } = args;
  
    try {
      const response = await axios.get(
        `${this.flightAwareBaseUrl}/airports/${origin}/flights/to/${destination}`,
        {
          headers: {
            "x-apikey": this.flightAwareApiKey,
          },
          params: {
            type: "Airline",
            connection: "nonstop",
            max_pages: 3,
          },
        }
      );
  
      const allFlights = response.data.flights || [];
      
      if (allFlights.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                route: `${origin} to ${destination}`,
                flights: [],
                message: "No nonstop flights found on this route",
              }),
            },
          ],
        };
      }
  
      // Get timezones for origin and destination
      const originTz = AIRPORT_TIMEZONES[origin] || 'America/Los_Angeles';
      const destTz = AIRPORT_TIMEZONES[destination] || 'America/Los_Angeles';
  
      // Extract and convert times
      const flights = allFlights
        .map((flight: any) => flight.segments?.[0])
        .filter((segment: any) => segment)
        .map((segment: any) => {
          // Convert UTC times to local airport times
          const departureLocal = segment.scheduled_out 
            ? DateTime.fromISO(segment.scheduled_out, { zone: 'UTC' })
                .setZone(originTz)
                .toFormat('h:mm a')
            : 'Unknown';
          
          const arrivalLocal = segment.scheduled_in
            ? DateTime.fromISO(segment.scheduled_in, { zone: 'UTC' })
                .setZone(destTz)
                .toFormat('h:mm a')
            : 'Unknown';
        
          const departureDate = segment.scheduled_out
            ? DateTime.fromISO(segment.scheduled_out, { zone: 'UTC' })
                .setZone(originTz)
                .toFormat('MMM d, yyyy')
            : 'Unknown';
        
          return {
            flight_number: segment.ident_iata || segment.ident,
            airline: segment.operator_iata || segment.operator,
            departure_date: departureDate,
            departure_time: departureLocal,
            arrival_time: arrivalLocal,
            departure_gate: segment.gate_origin || null,
            arrival_gate: segment.gate_destination || null,
            departure_delay_minutes: segment.departure_delay || 0,
            arrival_delay_minutes: segment.arrival_delay || 0,
            status: segment.status,
          };
        });
  
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              route: `${origin} to ${destination}`,
              origin_timezone: originTz,
              destination_timezone: destTz,
              count: flights.length,
              flights: flights,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("FlightAware API error:", error.response?.data || error.message);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: `Could not retrieve flights: ${error.message}`,
              route: `${origin} to ${destination}`,
            }),
          },
        ],
      };
    }
  }
  
  
  private async logUserQuery(args: any) {
    const { user_phone, query, flight_info } = args;
  
    try {
      // Get user_id from phone number
      const { data: userData, error: userError } = await this.supabase
        .from("users")
        .select("id")
        .eq("phone_number", user_phone)
        .single();
  
      if (userError || !userData) {
        throw new Error("User not found");
      }
  
      const flightData = flight_info ? JSON.parse(flight_info) : {};
  
      const { data, error } = await this.supabase
        .from("user_flights")
        .insert({
          user_id: userData.id,
          flight_number: flightData.flight_number || query,
          origin: flightData.origin || null,
          destination: flightData.destination || null,
          departure_time: flightData.departure_time || null,
          flight_date: flightData.flight_date || new Date().toISOString().split('T')[0],
        })
        .select();
  
      if (error) throw error;
  
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, data: data }),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: `Database error: ${error.message}` }),
          },
        ],
      };
    }
  }

  private async getUserFlightHistory(userPhone: string) {
    try {
      // First get user_id from phone number
      const { data: userData, error: userError } = await this.supabase
        .from("users")
        .select("id")
        .eq("phone_number", userPhone)
        .single();
  
      if (userError || !userData) {
        return {
          contents: [
            {
              uri: `flight://history/${userPhone}`,
              mimeType: "application/json",
              text: JSON.stringify({ user: userPhone, history: [] }),
            },
          ],
        };
      }
  
      // Then get flights for that user
      const { data, error } = await this.supabase
        .from("user_flights")
        .select("*")
        .eq("user_id", userData.id)
        .order("flight_date", { ascending: false })
        .limit(10);
  
      if (error) throw error;
  
      return {
        contents: [
          {
            uri: `flight://history/${userPhone}`,
            mimeType: "application/json",
            text: JSON.stringify({
              user: userPhone,
              history: data || [],
            }),
          },
        ],
      };
    } catch (error: any) {
      return {
        contents: [
          {
            uri: `flight://history/${userPhone}`,
            mimeType: "application/json",
            text: JSON.stringify({ error: error.message }),
          },
        ],
      };
    }
  }

  private async sendFlightSms(args: any) {
    const { phone_number, message } = args;
    
    try {
      const response = await axios.post(
        'https://api.telnyx.com/v2/messages',
        {
          from: '+12138986347',
          to: phone_number,
          text: message,
          messaging_profile_id: '40019a5c-5425-463a-8448-91f434dd550c'
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`,
          }
        }
      );
  
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ 
            success: true, 
            message: "SMS sent successfully" 
          })
        }]
      };
    } catch (error: any) {
      console.error('SMS error:', error.response?.data || error.message);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ 
            success: false, 
            error: error.message 
          })
        }]
      };
    }
  }



  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("SkySync MCP Server running");
  }
}

const server = new SkySyncMCPServer();
server.run().catch(console.error);