import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.25.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const PREMIUM_PURPOSE = "premium";

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const premiumPriceId = Deno.env.get("STRIPE_PRICE_PREMIUM");

  if (!supabaseUrl || !serviceRole || !stripeSecretKey) {
    return json({ error: "Missing env configuration" }, 500);
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) return json({ error: "Unauthorized: Missing bearer token" }, 401);
  if (token.split(".").length !== 3) return json({ error: "Unauthorized: Invalid token format" }, 401);

  const adminClient = createClient(supabaseUrl, serviceRole);
  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-04-10" });

  const { data: authData, error: authErr } = await adminClient.auth.getUser(token);
  if (authErr || !authData.user) {
    return json({ error: `Unauthorized: ${authErr?.message ?? "No authenticated user on token"}` }, 401);
  }

  const userId = authData.user.id;
  const email = String(authData.user.email ?? "").trim();
  if (!email) return json({ error: "Missing user email" }, 400);

  try {
    const customers = await stripe.customers.list({ email, limit: 10 });

    let premiumActive = false;

    for (const customer of customers.data) {
      if (!customer.id) continue;
      const subs = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 100 });

      const hasLivePremium = subs.data.some((sub) => {
        if (sub.status !== "active" && sub.status !== "trialing") return false;

        const purpose = String(sub.metadata?.purpose ?? "").trim();
        if (purpose === PREMIUM_PURPOSE) return true;

        if (!premiumPriceId) return false;
        return sub.items.data.some((item) => item.price?.id === premiumPriceId);
      });

      if (hasLivePremium) {
        premiumActive = true;
        break;
      }
    }

    const { error: updErr } = await adminClient
      .from("profiles")
      .update({ is_premium: premiumActive } as any)
      .eq("id", userId);

    if (updErr) return json({ error: updErr.message }, 500);

    return json({ isPremium: premiumActive });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: `Stripe sync error: ${message}` }, 500);
  }
});