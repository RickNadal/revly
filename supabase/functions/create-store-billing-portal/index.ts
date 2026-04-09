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
  const returnUrl = Deno.env.get("STRIPE_CHECKOUT_SUCCESS_URL") ?? Deno.env.get("STRIPE_CHECKOUT_CANCEL_URL") ?? "https://revly.app";

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

  const { data: sub } = await adminClient
    .from("business_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  const customerId = String((sub as any)?.stripe_customer_id ?? "").trim();
  if (!customerId) {
    return json({ error: "No billing setup found for this account." }, 400);
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
      configuration: "bpc_1THQ4FJD8YRbDapt1NmyRIeQ",
    });

    return json({ url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: `Stripe error: ${message}` }, 500);
  }
});
