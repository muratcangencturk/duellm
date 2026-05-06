import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const OLLAMA = "https://api.ollama.com";
const OLLAMA_KEY = "5ba3a04cfb774ebea0df4ac5a65152a0.lSiGM2iwwv9DUON-6sALjsOU";
const LIMITS: Record<string, number> = { guest: 10000, user: 30000, premium: 300000 };

const sb = createClient(
  "https://snsyrkukdmjpovxrsrcw.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuc3lya3VrZG1qcG92eHJzcmN3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzgxNDk1NiwiZXhwIjoyMDkzMzkwOTU2fQ.UODAA6Jgiir1BnMNofUL2gMsja8bw5bRTYBwsacIYsQ"
);

const clean = (t: string) => t.replace(/<\s*think\s*>[\s\S]*?<\s*\/\s*think\s*>/gi, " ").replace(/<\s*think\s*\/\s*>/gi, "").trim();
const dk = (uid: string) => uid + ":" + new Date().toISOString().split("T")[0];

const handler: Handler = async (event) => {
  const h = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, x-duellm-uid, x-duellm-tier" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: h, body: "" };

  const path = event.path.replace("/.netlify/functions/chat", "").replace("/api/chat", "").replace("/api", "");

  // GUMROAD WEBHOOK
  if (event.httpMethod === "POST" && path === "/webhook") {
    try {
      const body = new URLSearchParams(event.body || "");
      const email = body.get("email") || "";
      const isCancelled = body.get("subscription_cancelled") === "true";
      const isFailed = body.get("subscription_failed") === "true";
      const isDeactivated = body.get("subscription_deactivated") === "true";
      if (isCancelled || isFailed || isDeactivated) {
        const { data: user } = await sb.from("users").select("id").eq("email", email).maybeSingle();
        if (user) await sb.from("users").update({ tier: "user" }).eq("id", user.id);
      }
      return { statusCode: 200, headers: h, body: "OK" };
    } catch { return { statusCode: 200, headers: h, body: "OK" }; }
  }

  // SIGNUP
  if (event.httpMethod === "POST" && path === "/signup") {
    const { email, password, username } = JSON.parse(event.body || "{}");
    if (!email || !password || !username) return { statusCode: 400, headers: h, body: JSON.stringify({ error: "All fields required" }) };
    const { data: ex1 } = await sb.from("users").select("id").eq("email", email).maybeSingle();
    if (ex1) return { statusCode: 409, headers: h, body: JSON.stringify({ error: "Email already registered" }) };
    const { data: ex2 } = await sb.from("users").select("id").eq("username", username).maybeSingle();
    if (ex2) return { statusCode: 409, headers: h, body: JSON.stringify({ error: "Username taken" }) };
    const { data: u, error } = await sb.from("users").insert({ email, password_hash: password, username }).select("id,username,email,tier").single();
    if (error) return { statusCode: 500, headers: h, body: JSON.stringify({ error: "Registration failed" }) };
    return { statusCode: 200, headers: h, body: JSON.stringify({ success: true, user_id: u.id, username: u.username, email: u.email, tier: u.tier }) };
  }

  // LOGIN
  if (event.httpMethod === "POST" && path === "/login") {
    const { email, password } = JSON.parse(event.body || "{}");
    if (!email || !password) return { statusCode: 400, headers: h, body: JSON.stringify({ error: "Email and password required" }) };
    const { data: u } = await sb.from("users").select("*").eq("email", email).eq("password_hash", password).maybeSingle();
    if (!u) return { statusCode: 401, headers: h, body: JSON.stringify({ error: "Invalid email or password" }) };
    return { statusCode: 200, headers: h, body: JSON.stringify({ success: true, user_id: u.id, username: u.username, email: u.email, tier: u.tier }) };
  }

  // VERIFY ORDER
  if (event.httpMethod === "POST" && path === "/verify") {
    const { user_id, order_id } = JSON.parse(event.body || "{}");
    if (!user_id || !order_id) return { statusCode: 400, headers: h, body: JSON.stringify({ error: "Missing params" }) };
    try {
      const r = await fetch("https://api.gumroad.com/v2/sales/" + encodeURIComponent(order_id));
      const d = await r.json();
      if (!d.success || !d.sale) return { statusCode: 400, headers: h, body: JSON.stringify({ error: "Invalid Order ID" }) };
      if (!d.sale.product_name.toLowerCase().includes("duellm")) return { statusCode: 400, headers: h, body: JSON.stringify({ error: "Not a duellm order" }) };
      if (d.sale.subscription_cancelled || d.sale.subscription_failed) return { statusCode: 400, headers: h, body: JSON.stringify({ error: "Subscription cancelled" }) };
      const { data: user } = await sb.from("users").select("email").eq("id", user_id).single();
      if (user && d.sale.email.toLowerCase() === user.email.toLowerCase()) {
        await sb.from("users").update({ tier: "premium" }).eq("id", user_id);
        return { statusCode: 200, headers: h, body: JSON.stringify({ success: true, tier: "premium" }) };
      }
      return { statusCode: 400, headers: h, body: JSON.stringify({ error: "Email mismatch" }) };
    } catch (e: any) {
      return { statusCode: 400, headers: h, body: JSON.stringify({ error: "Verification failed" }) };
    }
  }

  // CHAT
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: h, body: JSON.stringify({ error: "Method Not Allowed" }) };
  const payload = JSON.parse(event.body || "{}");
  const uid = event.headers["x-duellm-uid"] || "";
  let tier = "guest", limit = LIMITS.guest;
  if (uid) {
    const { data: u } = await sb.from("users").select("tier").eq("id", uid).maybeSingle();
    tier = u?.tier || "user";
    limit = LIMITS[tier] || LIMITS.user;
  }

  if (uid) {
    const key = dk(uid);
    const { data: usage } = await sb.from("token_usage").select("total_tokens").eq("user_id", key).maybeSingle();
    if (usage && usage.total_tokens >= limit)
      return { statusCode: 429, headers: h, body: JSON.stringify({ error: "daily_limit", limit, used: usage.total_tokens }) };
  }

  payload.options = { ...(payload.options || {}), num_predict: Math.min(payload.options?.num_predict || 256, 256) };
  payload.stream = false;

  try {
    const res = await fetch(OLLAMA + "/api/chat", {
      method: "POST",
      headers: { Authorization: "Bearer " + OLLAMA_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    let content = clean(data.message?.content || "");
    if (!content || content.length < 3) content = "Interesting — tell me more.";

    if (uid) {
      const key = dk(uid);
      const tokEst = Math.ceil(content.length / 4);
      const { data: ex } = await sb.from("token_usage").select("total_tokens").eq("user_id", key).maybeSingle();
      const cur = ex?.total_tokens || 0;
      await sb.from("token_usage").upsert(
        { user_id: key, user_ref: uid, date: new Date().toISOString().split("T")[0], total_tokens: cur + tokEst },
        { onConflict: "user_id" }
      );
    }

    return { statusCode: 200, headers: h, body: JSON.stringify({ model: data.model, message: { role: "assistant", content }, done: true }) };
  } catch (e: any) {
    return { statusCode: 500, headers: h, body: JSON.stringify({ error: "api_error", message: e.message }) };
  }
};

export { handler };
