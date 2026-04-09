import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.25.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const PURPOSE = "bike_boost";

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

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

  const adminClient = createClient(supabaseUrl, serviceRole);
  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-04-10" });

  const { data: authData, error: authErr } = await adminClient.auth.getUser(token);
  if (authErr || !authData.user) {
    return json({ error: `Unauthorized: ${authErr?.message ?? "No user"}` }, 401);
  }

  const buyerId = authData.user.id;
  const buyerEmail = String(authData.user.email ?? "").trim();

  let body: { cycle_id?: string; submission_id?: string; boost_type_id?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const cycleId = String(body.cycle_id ?? "").trim();
  const submissionId = String(body.submission_id ?? "").trim();
  const boostTypeId = String(body.boost_type_id ?? "").trim();
  const message = String(body.message ?? "").slice(0, 200);

  if (!cycleId || !submissionId || !boostTypeId) {
    return json({ error: "cycle_id, submission_id, boost_type_id are required" }, 400);
  }

  const { data: sub, error: subErr } = await adminClient
    .from("bike_of_month_submissions")
    .select("id, user_id, bike_name")
    .eq("id", submissionId)
    .eq("cycle_id", cycleId)
    .maybeSingle();

  if (subErr || !sub) return json({ error: "Submission not found" }, 404);
  if (String(sub.user_id) === buyerId) return json({ error: "You cannot boost your own bike." }, 400);

  const { data: boost, error: boostErr } = await adminClient
    .from("bike_of_month_boost_types")
    .select("id, name, emoji, price_cents, vote_points, active")
    .eq("id", boostTypeId)
    .maybeSingle();

  if (boostErr || !boost || !boost.active) return json({ error: "Boost type unavailable" }, 400);

  const checkout = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: Number(boost.price_cents),
          product_data: {
            name: `${boost.emoji} ${boost.name} Boost`,
            description: `Boost ${sub.bike_name} in Bike of the Month (+${boost.vote_points} pts)`,
          },
        },
        quantity: 1,
      },
    ],
    customer_email: buyerEmail || undefined,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      purpose: PURPOSE,
      buyer_id: buyerId,
      cycle_id: cycleId,
      submission_id: submissionId,
      boost_type_id: boostTypeId,
      message,
    },
  });

  return json({ url: checkout.url });
});
