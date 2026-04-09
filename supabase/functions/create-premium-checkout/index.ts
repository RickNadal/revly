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
  const pricePremium = Deno.env.get("STRIPE_PRICE_PREMIUM");
  const successUrl = Deno.env.get("STRIPE_CHECKOUT_SUCCESS_URL");
  const cancelUrl = Deno.env.get("STRIPE_CHECKOUT_CANCEL_URL");

  if (!supabaseUrl || !serviceRole || !stripeSecretKey || !successUrl || !cancelUrl) {
    return json({ error: "Missing env configuration" }, 500);
  }

  if (!pricePremium) {
    return json({ error: "Missing STRIPE_PRICE_PREMIUM" }, 500);
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
  const userEmail = String(authData.user.email ?? "").trim();

  const { data: profile } = await adminClient
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  try {
    try {
      await stripe.prices.retrieve(pricePremium);
    } catch (priceErr: unknown) {
      const msg = priceErr instanceof Error ? priceErr.message : String(priceErr);
      return json({ error: `Invalid premium price: ${pricePremium}. ${msg}` }, 500);
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: pricePremium, quantity: 1 }],
      customer_email: userEmail || undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      metadata: {
        user_id: userId,
        purpose: PREMIUM_PURPOSE,
      },
      subscription_data: {
        metadata: {
          user_id: userId,
          purpose: PREMIUM_PURPOSE,
          customer_name: String(profile?.full_name ?? "").trim(),
        },
      },
    });

    return json({ url: checkout.url, sessionId: checkout.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: `Stripe error: ${message}` }, 500);
  }
});