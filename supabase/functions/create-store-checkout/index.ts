import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.25.0";

const DEFAULT_STORE_PRICE_ID = "price_1THOVKJD8YRbDapt6TdhZt80";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const priceId = String((body as any)?.priceId ?? DEFAULT_STORE_PRICE_ID).trim() || DEFAULT_STORE_PRICE_ID;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const successUrl = Deno.env.get("STRIPE_CHECKOUT_SUCCESS_URL");
  const cancelUrl = Deno.env.get("STRIPE_CHECKOUT_CANCEL_URL");

  if (!supabaseUrl || !serviceRole || !stripeSecretKey || !successUrl || !cancelUrl) {
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

  const [{ data: account }, { data: profile }, { data: existingSub }] = await Promise.all([
    adminClient
      .from("business_accounts")
      .select("business_name, contact_email, status")
      .eq("user_id", userId)
      .maybeSingle(),
    adminClient.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    adminClient.from("business_subscriptions").select("stripe_customer_id").eq("user_id", userId).maybeSingle(),
  ]);

  if (!account) {
    return json({ error: "No store account found. Submit your store application first." }, 400);
  }

  const customerEmail = String(account.contact_email ?? authData.user.email ?? "").trim();
  if (!customerEmail) return json({ error: "Missing customer email" }, 400);

  try {
    try {
      await stripe.prices.retrieve(priceId);
    } catch (priceErr: unknown) {
      const msg = priceErr instanceof Error ? priceErr.message : String(priceErr);
      return json({ error: `Invalid store price: ${priceId}. ${msg}` }, 500);
    }

    let customerId = String(existingSub?.stripe_customer_id ?? "").trim();

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: customerEmail,
        name: String(profile?.full_name ?? account.business_name ?? "Store Owner"),
        metadata: { user_id: userId, purpose: "store" },
      });
      customerId = customer.id;
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      metadata: {
        user_id: userId,
        purpose: "store",
      },
      subscription_data: {
        metadata: {
          user_id: userId,
          purpose: "store",
        },
      },
    });

    const { error: subErr } = await adminClient.from("business_subscriptions").upsert(
      {
        user_id: userId,
        tier_id: "dealer_basic",
        status: "pending_payment",
        stripe_customer_id: customerId,
      } as any,
      { onConflict: "user_id" }
    );

    if (subErr) {
      return json({ error: `Database error: ${subErr.message}` }, 500);
    }

    return json({ url: checkout.url, sessionId: checkout.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: `Stripe error: ${message}` }, 500);
  }
});
