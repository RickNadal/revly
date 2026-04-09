import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STEP_TIMEOUT_MS = 12000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function withStepTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), STEP_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function decodeJwtSub(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = atob(padded);
    const data = JSON.parse(decoded);
    const sub = String(data?.sub ?? "").trim();
    return sub || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return json({ error: "Missing env configuration" }, 500);

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Unauthorized: Missing bearer token" }, 401);
  if (token.split(".").length !== 3) return json({ error: "Unauthorized: Invalid token format" }, 401);

  const adminClient = createClient(supabaseUrl, serviceRole);

  const requesterId = decodeJwtSub(token);
  if (!requesterId) return json({ error: "Unauthorized: Invalid token payload" }, 401);

  const { data: requesterProfile } = await withStepTimeout(
    adminClient
      .from("profiles")
      .select("role")
      .eq("id", requesterId)
      .maybeSingle(),
    "load requester profile"
  );

  const requesterRole = String((requesterProfile as any)?.role ?? "user");
  if (requesterRole !== "admin") {
    return json({ error: "Forbidden: admin role required" }, 403);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const targetUserId = String(body?.targetUserId ?? "").trim();
  const action = String(body?.action ?? "grant").trim();
  const mode = String(body?.mode ?? "").trim();
  const tierId = String(body?.tierId ?? "dealer_basic").trim() || "dealer_basic";
  const businessName = String(body?.businessName ?? "Business account").trim() || "Business account";

  if (!targetUserId) return json({ error: "targetUserId is required" }, 400);

  if (action === "status") {
    const [{ data: account }, { data: subscription }] = await withStepTimeout(
      Promise.all([
        adminClient
          .from("business_accounts")
          .select("status, tier_id, dealer_type")
          .eq("user_id", targetUserId)
          .maybeSingle(),
        adminClient
          .from("business_subscriptions")
          .select("status, tier_id")
          .eq("user_id", targetUserId)
          .maybeSingle(),
      ]),
      "load bypass status"
    );

    const accountStatus = String((account as any)?.status ?? "none");
    const subscriptionStatus = String((subscription as any)?.status ?? "none");
    const dealerType = String((account as any)?.dealer_type ?? "");
    const resolvedTierId = String((account as any)?.tier_id ?? (subscription as any)?.tier_id ?? "dealer_basic");
    const dealerBypass =
      accountStatus === "active" && (subscriptionStatus === "active" || subscriptionStatus === "trialing");
    const storeBypass = dealerBypass && /^store\|/i.test(dealerType);

    return json({
      ok: true,
      accountStatus,
      subscriptionStatus,
      dealerType,
      tierId: resolvedTierId,
      dealerBypass,
      storeBypass,
    });
  }

  if (mode !== "dealer" && mode !== "store") return json({ error: "mode must be dealer or store" }, 400);

  const { data: existingAccount } = await withStepTimeout(
    adminClient
      .from("business_accounts")
      .select("dealer_type")
      .eq("user_id", targetUserId)
      .maybeSingle(),
    "load existing account"
  );

  const existingDealerType = String((existingAccount as any)?.dealer_type ?? "");
  const dealerType = mode === "store"
    ? (/^store\|/i.test(existingDealerType) ? existingDealerType : "store|general")
    : (existingDealerType || null);

  const fallbackEmail = `admin-bypass+${targetUserId.slice(0, 8)}@revly.app`;

  const { error: accountErr } = await withStepTimeout(
    adminClient.from("business_accounts").upsert(
      {
        user_id: targetUserId,
        business_name: businessName,
        contact_email: fallbackEmail,
        dealer_type: dealerType,
        tier_id: tierId,
        status: "active",
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: "user_id" }
    ),
    "upsert business account"
  );

  if (accountErr) {
    return json({ error: accountErr.message, code: (accountErr as any)?.code ?? null, stage: "business_accounts_upsert" }, 400);
  }

  const { error: subErr } = await withStepTimeout(
    adminClient.from("business_subscriptions").upsert(
      {
        user_id: targetUserId,
        tier_id: tierId,
        status: "active",
        current_period_end: null,
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: "user_id" }
    ),
    "upsert business subscription"
  );

  if (subErr) {
    return json({ error: subErr.message, code: (subErr as any)?.code ?? null, stage: "business_subscriptions_upsert" }, 400);
  }

    return json({ ok: true, mode, targetUserId, tierId, dealerType });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message || "Unhandled function error" }, 500);
  }
});

addEventListener("unhandledrejection", (event) => {
  console.error("admin-grant-business-bypass unhandled rejection", event.reason);
});

addEventListener("error", (event) => {
  console.error("admin-grant-business-bypass runtime error", event.error);
});
