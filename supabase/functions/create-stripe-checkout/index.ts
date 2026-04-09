import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.25.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const priceBasic = Deno.env.get("STRIPE_PRICE_DEALER_BASIC");
  const pricePro = Deno.env.get("STRIPE_PRICE_DEALER_PRO");
  const productBasic = Deno.env.get("STRIPE_PRODUCT_DEALER_BASIC");
  const productPro = Deno.env.get("STRIPE_PRODUCT_DEALER_PRO");
  const successUrl = Deno.env.get("STRIPE_CHECKOUT_SUCCESS_URL");
  const cancelUrl = Deno.env.get("STRIPE_CHECKOUT_CANCEL_URL");

  if (!supabaseUrl || !serviceRole || !stripeSecretKey || !successUrl || !cancelUrl) {
    return json({ error: "Missing env configuration" }, 500);
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return json({ error: "Unauthorized: Missing bearer token" }, 401);
  }

  if (token.split(".").length !== 3) {
    return json({ error: "Unauthorized: Invalid token format" }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRole);
  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-04-10" });

  const { data: authData, error: authErr } = await adminClient.auth.getUser(token);
  if (authErr || !authData.user) {
    return json(
      {
        error: `Unauthorized: ${authErr?.message ?? "No authenticated user on token"}`,
      },
      401
    );
  }

  const userId = authData.user.id;

  const [{ data: account }, { data: subscription }, { data: profile }] = await Promise.all([
    adminClient
      .from("business_accounts")
      .select("user_id, business_name, contact_email, tier_id, status")
      .eq("user_id", userId)
      .maybeSingle(),
    adminClient
      .from("business_subscriptions")
      .select("user_id, tier_id, status, stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle(),
    adminClient.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);

  if (!account) {
    return json({ error: "No business account found. Submit dealer application first." }, 400);
  }

  if (account.status !== "active") {
    return json({ error: "Business account is not approved yet." }, 400);
  }

  const tierId = String(subscription?.tier_id ?? account.tier_id ?? "dealer_basic");
  const configuredPriceId = tierId === "dealer_pro" ? pricePro : priceBasic;
  const configuredProductId = tierId === "dealer_pro" ? productPro : productBasic;

  let resolvedPriceId = String(configuredPriceId ?? "").trim();

  const customerEmail = String(account.contact_email ?? authData.user.email ?? "").trim();
  if (!customerEmail) return json({ error: "Missing customer email" }, 400);

  let customerId = String(subscription?.stripe_customer_id ?? "").trim();

  try {
    if (resolvedPriceId) {
      try {
        await stripe.prices.retrieve(resolvedPriceId);
      } catch {
        resolvedPriceId = "";
      }
    }

    if (!resolvedPriceId && configuredProductId) {
      const list = await stripe.prices.list({
        product: configuredProductId,
        active: true,
        type: "recurring",
        limit: 100,
      });
      const monthly = list.data.find((p) => p.recurring?.interval === "month");
      if (monthly?.id) resolvedPriceId = monthly.id;
    }

    if (!resolvedPriceId) {
      return json(
        {
          error:
            `Invalid Stripe price for tier ${tierId}. ` +
            `Configured price: ${configuredPriceId ?? "(missing)"}. ` +
            `Configured product: ${configuredProductId ?? "(missing)"}. ` +
            "Set a valid STRIPE_PRICE_DEALER_* secret or STRIPE_PRODUCT_DEALER_* fallback from the same Stripe mode as STRIPE_SECRET_KEY.",
        },
        500
      );
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: customerEmail,
        name: String(profile?.full_name ?? account.business_name ?? "Dealer"),
        metadata: { user_id: userId, tier_id: tierId },
      });
      customerId = customer.id;
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { user_id: userId, tier_id: tierId },
      subscription_data: { metadata: { user_id: userId, tier_id: tierId } },
      allow_promotion_codes: true,
    });

    const { error: upsertErr } = await adminClient.from("business_subscriptions").upsert(
      {
        user_id: userId,
        tier_id: tierId,
        status: "pending_payment",
        stripe_customer_id: customerId,
      } as any,
      { onConflict: "user_id" }
    );

    if (upsertErr) {
      return json({ error: `Database error: ${upsertErr.message}` }, 500);
    }

    return json({ url: checkout.url, sessionId: checkout.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: `Stripe error: ${message}` }, 500);
  }
});
