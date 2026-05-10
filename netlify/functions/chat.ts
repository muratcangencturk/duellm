import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const OLLAMA = "https://api.ollama.com";
const OLLAMA_KEY = "5ba3a04cfb774ebea0df4ac5a65152a0.lSiGM2iwwv9DUON-6sALjsOU";
const LIMITS: Record<string, number> = { guest: 10000, user: 30000, premium: 300000 };

const sb = createClient(
  "https://snsyrkukdmjpovxrsrcw.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuc3lya3VrZG1qcG92eHJzcmN3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjM2NTQxMywiZXhwIjoyMDYxOTQxNDEzfQ.P1V4G8h4RqP9nNl7QpL1GcJ8e3zNxO5XWqHq1VrMhYs"
);

const clean = (t: string) => {
  let txt = t;
  while (/<\s*think\s*>[\s\S]*?<\s*\/\s*think\s*>/gi.test(txt)) {
    txt = txt.replace(/<\s*think\s*>[\s\S]*?<\s*\/\s*think\s*>/gi, "");
  }
  txt = txt.replace(/<\s*think\s*\/\s*>/gi, "");
  return txt.trim();
};
const dk = (uid: string) => uid + ":" + new Date().toISOString().split("T")[0];

const handler: Handler = async (event) => {
  const h = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, x-duellm-uid, x-duellm-tier" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: h, body: "" };

  const path = event.path.replace("/.netlify/functions/chat", "").replace("/api/chat", "").replace("/api", "");
  const uid = event.headers["x-duellm-uid"] || "";

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
const GUMROAD_TOKEN = "ic0_wsrZJKdFr3ztBvBTQ_a3mn2iim3jR_5j3aXcrYI";
      const r = await fetch("https://api.gumroad.com/v2/sales/" + encodeURIComponent(order_id), { headers: { Authorization: "Bearer " + GUMROAD_TOKEN } });
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

  // ── HISTORY SYNC ──
  // GET history
  if (event.httpMethod === "GET" && path === "/history") {
    if (!uid) return { statusCode: 401, headers: h, body: JSON.stringify({ error: "Not authenticated" }) };
    try {
      const { data, error } = await sb.from("history").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(50);
      if (error) return { statusCode: 500, headers: h, body: JSON.stringify({ error: "Failed to fetch" }) };
      const mapped = (data || []).map((r: any) => ({ ...r, modelL: r.modell, modelR: r.modelr, sysL: r.sysl, sysR: r.sysr }));
      return { statusCode: 200, headers: h, body: JSON.stringify(mapped) };
    } catch (e: any) {
      return { statusCode: 500, headers: h, body: JSON.stringify({ error: e.message }) };
    }
  }

  // POST save history
  if (event.httpMethod === "POST" && path === "/history") {
    if (!uid) return { statusCode: 401, headers: h, body: JSON.stringify({ error: "Not authenticated" }) };
    try {
      const { id, topic, modelL, modelR, sysL, sysR, msgs } = JSON.parse(event.body || "{}");
      if (!id) return { statusCode: 400, headers: h, body: JSON.stringify({ error: "Missing id" }) };
      const { data: ex } = await sb.from("history").select("id").eq("user_id", uid).eq("id", id).maybeSingle();
      if (ex) {
        await sb.from("history").update({ topic, modell: modelL, modelr: modelR, sysl: sysL, sysr: sysR, msgs, updated_at: new Date().toISOString() }).eq("user_id", uid).eq("id", id);
      } else {
        await sb.from("history").insert({ id, user_id: uid, topic, modell: modelL, modelr: modelR, sysl: sysL, sysr: sysR, msgs });
      }
      return { statusCode: 200, headers: h, body: JSON.stringify({ success: true }) };
    } catch (e: any) {
      return { statusCode: 500, headers: h, body: JSON.stringify({ error: e.message }) };
    }
  }

  // DELETE history
  if (event.httpMethod === "DELETE" && (path === "/history" || path.startsWith("/history/"))) {
    if (!uid) return { statusCode: 401, headers: h, body: JSON.stringify({ error: "Not authenticated" }) };
    try {
      const entryId = path === "/history" ? (JSON.parse(event.body || "{}")).id : path.replace("/history/", "");
      if (!entryId) return { statusCode: 400, headers: h, body: JSON.stringify({ error: "Missing id" }) };
      await sb.from("history").delete().eq("user_id", uid).eq("id", entryId);
      return { statusCode: 200, headers: h, body: JSON.stringify({ success: true }) };
    } catch (e: any) {
      return { statusCode: 500, headers: h, body: JSON.stringify({ error: e.message }) };
    }
  }

  // CHAT
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: h, body: JSON.stringify({ error: "Method Not Allowed" }) };
  const payload = JSON.parse(event.body || "{}");
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

  payload.options = { ...(payload.options || {}), num_predict: Math.min(payload.options?.num_predict || 512, 512) };
  payload.stream = false;

  try {
    const res = await fetch(OLLAMA + "/api/chat", {
      method: "POST",
      headers: { Authorization: "Bearer " + OLLAMA_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    let content = clean(data.message?.content || "");
    if (!content || content.length < 3) content = "";

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
