import express from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT) || 3000;
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

app.get("/api/user-context/:phone_number", async (req, res) => {
  const { phone_number } = req.params;

  console.log("Looking for phone:", phone_number);
  console.log("Type:", typeof phone_number);

  // Find user
  const { data: users, error } = await supabase
    .from("users")
    .select("*")
    .eq("phone_number", phone_number)
  
  console.log("Raw data:", users); // Add this
  console.log("Error:", error);
  
  const user = users?.[0];
  
  
  console.log("Found user:", user); // Add this
  console.log("Error:", error); // Add this

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

  console.log("User ID:", user.id);

  // Find their next flight
  const { data: flight, error: flightError } = await supabase
    .from("user_flights")
    .select("*")
    .eq("user_id", user.id)
    .gte("flight_date", new Date().toISOString().split("T")[0])
    .order("flight_date", { ascending: true })
    .limit(1)
    .single();
  

  console.log("Flight query result:", flight); // Add this
  console.log("Flight error:", flightError);

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

app.get("/health", async (req, res) => {
  const { data, error } = await supabase
    .from("users")
    .select("count");
  
  res.json({ 
    supabase_connected: !error,
    user_count: data,
    error: error 
  });
});

app.listen(PORT, () => {
  console.log(`Webhook running on port ${PORT}`);
});



