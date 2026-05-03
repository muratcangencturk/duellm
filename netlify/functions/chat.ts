import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const DAILY_LIMIT = 20000;

const handler: Handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-duellm-uid",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  const path = event.path.replace("/.netlify/functions/chat", "").replace("/api/chat", "");

  if (path === "/tokens") {
    const uid = event.headers["x-duellm-uid"];
    if (!uid) return { statusCode: 200, headers, body: JSON.stringify({ remaining: DAILY_LIMIT }) };

    try {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("token_usage")
        .select("total_tokens")
        .eq("user_id", uid)
        .eq("date", today)
        .single();

      const used = data?.total_tokens || 0;
      return { statusCode: 200, headers, body: JSON.stringify({ used, remaining: Math.max(0, DAILY_LIMIT - used) }) };
    } catch {
      return { statusCode: 200, headers, body: JSON.stringify({ remaining: DAILY_LIMIT }) };
    }
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing API key" }) };
  }

  const uid = event.headers["x-duellm-uid"];

  if (uid) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("token_usage")
        .select("total_tokens")
        .eq("user_id", uid)
        .eq("date", today)
        .single();

      if (data && data.total_tokens >= DAILY_LIMIT) {
        return {
          statusCode: 429,
          headers,
          body: JSON.stringify({ error: { message: "Daily token limit reached (20K)" } }),
        };
      }
    } catch {}
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://duellm.netlify.app",
        "X-Title": "duellm",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = await response.text();
    const data = JSON.parse(body);

    if (uid && data.usage?.total_tokens) {
      const today = new Date().toISOString().split("T")[0];
      try {
        await supabase.from("token_usage").upsert(
          { user_id: uid, date: today, total_tokens: data.usage.total_tokens },
          { onConflict: "user_id,date" }
        );
      } catch {}
    }

    return { statusCode: response.status, headers, body };
  } catch (err: any) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: { message: err.message || "API Error" } }) };
  }
};

export { handler };
