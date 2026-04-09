import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.25.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const GIFT_PURPOSE = "gift";
const GIFT_PRICE_ID_BY_TYPE: Record<string, string> = {
  trophy: "price_1THo1dJPmXhEFK37rouudv2M",
  crown: "price_1THo1XJPmXhEFK37syC4edHO",
  diamond: "price_1THo1YJPmXhEFK373jHbdkqV",
  lightning: "price_1THo1bJPmXhEFK37yQXnuIh1",
  fire: "price_1THo1YJPmXhEFK37NJatYQaa",
};

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
  if (token.split(".").length !== 3) return json({ error: "Unauthorized: Invalid token format" }, 401);

  const adminClient = createClient(supabaseUrl, serviceRole);
  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-04-10" });

  const { data: authData, error: authErr } = await adminClient.auth.getUser(token);
  if (authErr || !authData.user) {
    return json({ error: `Unauthorized: ${authErr?.message ?? "No user"}` }, 401);
  }

  const senderId = authData.user.id;
  const senderEmail = String(authData.user.email ?? "").trim();

  let body: { gift_type_id?: string; recipient_id?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { gift_type_id, recipient_id, message } = body;

  if (!gift_type_id || typeof gift_type_id !== "string") {
    return json({ error: "gift_type_id is required" }, 400);
  }
  if (!recipient_id || typeof recipient_id !== "string") {
    return json({ error: "recipient_id is required" }, 400);
  }
  if (recipient_id === senderId) {
    return json({ error: "You cannot gift yourself." }, 400);
  }

  // Look up gift type
  const { data: gift, error: giftErr } = await adminClient
    .from("gift_types")
    .select("id, name, emoji, price_cents, score_value, active")
    .eq("id", gift_type_id)
    .single();

  if (giftErr || !gift) {
    return json({ error: "Gift type not found" }, 404);
  }
  if (!gift.active) {
    return json({ error: "This gift is no longer available" }, 400);
  }

  const giftTypeKey = String(gift.id ?? "").toLowerCase().trim();
  const configuredPriceId = GIFT_PRICE_ID_BY_TYPE[giftTypeKey];

  // Verify recipient exists
  const { data: recipient, error: recipErr } = await adminClient
    .from("profiles")
    .select("id, full_name")
    .eq("id", recipient_id)
    .maybeSingle();

  if (recipErr || !recipient) {
    return json({ error: "Recipient not found" }, 404);
  }

  try {
    let resolvedPriceId = String(configuredPriceId ?? "").trim();
    if (resolvedPriceId) {
      try {
        await stripe.prices.retrieve(resolvedPriceId);
      } catch {
        resolvedPriceId = "";
      }
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = resolvedPriceId
      ? [{ price: resolvedPriceId, quantity: 1 }]
      : [
          {
            price_data: {
              currency: "usd",
              unit_amount: Number(gift.price_cents),
              product_data: {
                name: `${gift.emoji} ${gift.name}`,
                description: `Gift for ${String(recipient.full_name ?? "Rider")} (+${Number(gift.score_value)} pts)`,
              },
            },
            quantity: 1,
          },
        ];

    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      customer_email: senderEmail || undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        purpose: GIFT_PURPOSE,
        sender_id: senderId,
        recipient_id,
        gift_type_id,
        message: String(message ?? "").slice(0, 200),
      },
    });

    return json({ url: checkout.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: `Stripe error: ${msg}` }, 500);
  }
});
