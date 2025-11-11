# SkySync - Voice AI Flight Assistant

**A hands-free flight information assistant powered by Telnyx Voice AI and Model Context Protocol**


---

## 🎯 What is SkySync?

SkySync is a voice-first AI assistant that lets you check flight information by simply making a phone call. No app, no screen, no menu navigation - just natural conversation.

**Call:** +1 (213) 898-6347  
**Register:** https://skysync-deploy-production.up.railway.app/

### Why SkySync?

**The Problem:**
- You're driving to the airport - can't safely check your phone
- You have poor internet connectivity  
- You need quick flight info without opening multiple apps
- You want hands-free access while multitasking

**The Solution:**
- **Call** SkySync from any phone
- **Ask** naturally: "What's the status of my flight?"
- **Get** instant, accurate information with gates, delays, and times
- **Done** in under 30 seconds

---

## ✨ Features

### Core Capabilities

🔍 **Flight Status**
- Check any flight by airline and number
- Get departure/arrival times in local timezone
- See gate information and delays
- Know if flight is cancelled or diverted

🌍 **Route Search**
- Find flights between any two airports
- Filter by date and time of day
- Get 3-5 most relevant options
- Compare multiple airlines

⏰ **Real-time Updates**
- Live delay information
- Gate changes
- Flight status (scheduled, boarding, departed, arrived)
- Accurate timezone-aware times

👤 **Personalized Experience**
- Greets you by name
- Remembers your home airport
- Saves your preferences
- Natural conversation flow

---

## 🏗️ Architecture

```
┌─────────────┐
│  User Calls │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│     Telnyx Voice AI Platform        │
│  • Claude Sonnet 3.5                │
│  • Speech-to-Text & Text-to-Speech  │
└──────┬──────────────────┬───────────┘
       │                  │
       │ Dynamic          │ MCP
       │ Webhook          │ Protocol
       ▼                  ▼
┌──────────────┐   ┌─────────────┐
│ Express API  │   │ MCP Server  │
│ (Railway)    │   │ (Node.js)   │
└──────┬───────┘   └──────┬──────┘
       │                  │
       ▼                  ▼
┌──────────────┐   ┌─────────────┐
│  Supabase    │   │ FlightAware │
│  PostgreSQL  │   │    API      │
└──────────────┘   └─────────────┘
```

### Tech Stack

- **Voice AI:** Telnyx Voice AI with Claude Sonnet 3.5
- **Backend:** Node.js + TypeScript + Express
- **MCP Server:** Custom implementation with @modelcontextprotocol/sdk
- **Database:** Supabase PostgreSQL
- **APIs:** FlightAware AeroAPI v4, Resend
- **Deployment:** Railway (us-east-1)
- **Frontend:** HTML/CSS/JavaScript

---

## 🚀 Setup Instructions

### Prerequisites

- Node.js 20.x or higher
- npm or yarn
- Telnyx account (use code `TELNYXFDE2025` for credit)
- Supabase account
- FlightAware API key (free tier)
- Resend API key (optional, for emails)

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/[your-username]/skysync.git
cd skysync

# Install root dependencies
npm install

# Install MCP server dependencies
cd mcp-server
npm install
cd ..

# Install API server dependencies
cd api
npm install
cd ..
```

### 2. Environment Variables

Create a `.env` file in the root directory:

```env
# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key

# FlightAware
FLIGHTAWARE_API_KEY=your_flightaware_key

# Resend (optional)
RESEND_API_KEY=your_resend_key

# Security
INTERNAL_BEARER=your_secret_token

# Server
PORT=3002
```

### 3. Database Setup

Run these SQL commands in your Supabase SQL editor:

```sql
-- Create users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number TEXT UNIQUE NOT NULL,
  name TEXT,
  home_airport TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_flights table
CREATE TABLE user_flights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  flight_number TEXT,
  origin TEXT,
  destination TEXT,
  departure_time TEXT,
  flight_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_user_flights_user_id ON user_flights(user_id);
CREATE INDEX idx_user_flights_date ON user_flights(flight_date DESC);
```

### 4. Build & Run Locally

```bash
# Build both projects
npm run build

# Start the server
npm start
```

The server will start on `http://localhost:3002`

### 5. Deploy to Railway

```bash
# Install Railway CLI
npm install -g railway

# Login to Railway
railway login

# Initialize project
railway init

# Add environment variables in Railway dashboard

# Deploy
railway up
```

**Important:** Set Railway region to `us-east-1` for optimal latency with Supabase.

### 6. Telnyx Voice AI Setup

1. **Create Assistant in Telnyx Portal:**
   - Go to Voice AI > Assistants
   - Create new assistant named "SkySync"
   - Choose the model you want

2. **Configure MCP Integration:**
   - MCP Server URL: `https://your-railway-url.railway.app/mcp`
   - Bearer Token: Your `INTERNAL_BEARER` value
   - Enable all 4 tools

3. **Set Up Dynamic Webhook:**
   - Webhook URL: `https://your-railway-url.railway.app/api/user-context`
   - Method: POST
   - Add Bearer token authentication

4. **Copy System Prompt:**
   - Find the prompt template in your documentation
   - Update any placeholders with your values
   - Paste into Telnyx assistant configuration

5. **Assign Phone Number:**
   - Purchase a phone number in Telnyx
   - Assign to your SkySync assistant
   - Test by calling the number

---

## 📂 Project Structure

```
skysync/
├── api/                    # Express API server
│   ├── src/
│   │   └── server.ts      # Main API routes & webhook handlers
│   ├── dist/              # Compiled JavaScript
│   └── package.json
├── mcp-server/            # Custom MCP server
│   ├── src/
│   │   └── index.ts       # MCP tool implementations
│   ├── dist/              # Compiled JavaScript
│   └── package.json
├── public/                # Landing page
│   ├── index.html         # User registration form
│   ├── success.html       # Registration success page
│   ├── styles.css         # Styling
│   └── script.js          # Form handling
├── .env                   # Environment variables (create this)
├── package.json           # Root package.json with build scripts
└── README.md              # This file
```

---

## 🛠️ MCP Tools

### 1. get_flight_status

Check the status of a specific flight by airline code and flight number.

**Input:**
```json
{
  "airline_code": "WN",
  "flight_number": "1234"
}
```

**Output:**
```json
{
  "total_upcoming": 2,
  "flights": [
    {
      "ident": "WN1234",
      "status": "Scheduled",
      "origin": "SFO",
      "destination": "LAX",
      "departure_date": "Nov 12, 2025",
      "departure_time": "8:50 AM PST",
      "arrival_time": "10:15 AM PST",
      "gate_origin": "24",
      "gate_destination": "42A"
    }
  ]
}
```

### 2. search_flights_by_route

Find all flights between two airports.

**Input:**
```json
{
  "origin": "SFO",
  "destination": "LAX"
}
```

**Output:** Array of flights with times, gates, delays, and status.

### 3. log_user_query

Save user flight searches to database for history/analytics.

**Input:**
```json
{
  "user_phone": "+12135551234",
  "query": "flights SFO to LAX",
  "flight_info": { /* flight details */ }
}
```

### 4. send_flight_email

Email flight details to user.

**Input:**
```json
{
  "email": "user@example.com",
  "subject": "Flight Information",
  "flight_details": "Formatted flight information"
}
```

---

## 🎤 Example Conversations

**Check Flight Status:**
```
User: "What's the status of Southwest 4041?"
AI: "I see there are 2 upcoming flights for Southwest four zero four one - 
     one on November 11th at 7:15 AM and another on November 12th at 7:15 AM. 
     Which date are you traveling?"
User: "The 12th"
AI: "Southwest flight four zero four one on November 12th departs from San Jose 
     at 7:15 AM Pacific Time and arrives in Seattle at 9:22 AM Pacific Time. 
     The flight is on schedule, departing from Gate 10 and arriving at Gate A7. 
     No delays are reported."
```

**Search Flights:**
```
User: "Show me flights from San Francisco to Los Angeles tomorrow"
AI: "I found 42 flights for November 11th. What time works best - 
     morning, afternoon, or evening?"
User: "Morning flights please"
AI: "Here are some morning options: Southwest 188 at 8:10 AM from Gate 24, 
     United 1926 at 10 AM from Gate 25, and Alaska 2058 at 10:48 AM from Gate 32. 
     Would you like more details on any of these?"
```

---

## 🔧 API Endpoints

### Public Endpoints

- `GET /` - Landing page
- `POST /api/register` - User registration
- `GET /health` - Health check

### Protected Endpoints (require Bearer token)

- `POST /mcp` - MCP protocol handler (Telnyx calls this)
- `POST /api/user-context` - Dynamic webhook for personalization
- `GET /tools` - List available MCP tools
- `POST /tools/:toolName` - Call specific tool directly

---

## 🐛 Troubleshooting

### Webhook Timeout Issues

**Problem:** Webhook returning empty response

**Solution:**
1. Ensure Railway deployment is in `us-east-1` region
2. Check Supabase is also in US East
3. Verify bearer token is correct
4. Check logs: `railway logs`

### MCP Connection Errors

**Problem:** "MCP client not ready" error

**Solution:**
1. Check MCP server is running: `ps aux | grep node`
2. Verify environment variables are set
3. Check Railway logs for MCP initialization errors
4. Restart the service

### Flight Not Found

**Problem:** Tool returns "Flight not found"

**Possible Causes:**
1. Wrong airline code (use IATA: WN, AA, DL, etc.)
2. Flight number incorrect
3. Flight outside 2-day future window (FlightAware limitation)
4. Flight doesn't exist or is too far in past

---

## 📊 Performance

- **Webhook Response Time:** <200ms (optimized)
- **Flight Status Query:** ~500ms
- **Route Search:** ~700ms (45 flights)
- **Call Latency:** <500ms (STT + TTS)
- **Uptime:** 99.9% (Railway hosting)

---

## 🚨 Limitations

### FlightAware API (Free Tier)
- **2 days future, 10 days past:** Cannot check flights beyond this window
- **No real-time webhooks:** Must poll for updates
- **Some missing data:** Gate info may not be available until day-of

### Resend Email (Sandbox)
- **Own email only:** Can only send to verified email address
- **Solution:** Verify a domain to send to any recipient

### Voice Recognition
- **Background noise:** May affect transcription accuracy
- **Accents:** Works well but may occasionally misunderstand
- **Connection quality:** Requires decent phone line quality

---

## 🔒 Security

- **Bearer Token Auth:** All sensitive endpoints protected
- **Environment Variables:** Secrets stored securely
- **Supabase RLS:** Row-level security enabled
- **No API Keys in Code:** All credentials in `.env`

---

## 📈 Future Roadmap

### Phase 1 (Next 2 weeks)
- [ ] SMS notifications for delays
- [ ] Weather integration
- [ ] Multi-leg flight support

### Phase 2 (Next month)
- [ ] Price tracking and alerts
- [ ] Calendar integration
- [ ] Analytics dashboard

### Phase 3 (Future)
- [ ] Multi-language support
- [ ] Hotel & car rental bookings
- [ ] Loyalty program integration

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project was built as part of the Telnyx AI Assistant & MCP Server Coding Challenge.

---

## 👤 Author

**Dheeraj Anikar**
- Email: dheerajanikar.12@gmail.com
- GitHub: [@dheerajanikar](https://github.com/dheerajanikar)
- LinkedIn:https://linkedin.com/in/dheerajpanikar

---

## 🙏 Acknowledgments

- **Telnyx** for the Voice AI platform and coding challenge
- **Anthropic** for Claude and the MCP protocol
- **FlightAware** for real-time flight data API
- **Railway** for seamless deployment

---

## 📞 Demo

**Try SkySync now:**

📱 Call: +1 (213) 898-6347  
🌐 Register: https://skysync-deploy-production.up.railway.app/

**Example queries to try:**
- "What's the status of Southwest 4041?"
- "Show me flights from San Francisco to Los Angeles tomorrow"
- "Is my flight delayed?"
- "Find morning flights to Seattle"

---

**Built with ❤️ for the Telnyx Coding Challenge**
