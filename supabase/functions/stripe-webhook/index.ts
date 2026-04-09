import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.25.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mapStripeStatus(status: string) {
  if (status === "active") return "active";
  if (status === "trialing") return "trialing";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  return "inactive";
}

function toIsoOrNull(unixSeconds?: number | null) {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

const PREMIUM_PURPOSE = "premium";
const DONATION_PURPOSE = "donation";
const GIFT_PURPOSE = "gift";
const BIKE_BOOST_PURPOSE = "bike_boost";
const STORE_PURPOSE = "store";

function isPremiumLive(status: string) {
  return status === "active" || status === "trialing";
}

async function sendGiftPush(adminClient: any, senderId: string, recipientId: string, giftTypeId: string) {
  const [senderRes, giftRes, tokensRes] = await Promise.all([
    adminClient.from("profiles").select("full_name").eq("id", senderId).maybeSingle(),
    adminClient.from("gift_types").select("emoji, name").eq("id", giftTypeId).maybeSingle(),
    adminClient.from("user_push_tokens").select("id, expo_push_token").eq("user_id", recipientId).eq("disabled", false),
  ]);

  const senderName = String(senderRes.data?.full_name ?? "Rider").trim() || "Rider";
  const giftEmoji = String(giftRes.data?.emoji ?? "🎁").trim() || "🎁";
  const giftName = String(giftRes.data?.name ?? "Gift").trim() || "Gift";

  const tokens = (tokensRes.data ?? []) as Array<{ id: string; expo_push_token: string }>;
  if (!tokens.length) return;

  const messages = tokens.map((row) => ({
    to: row.expo_push_token,
    sound: "default",
    title: "Oranga",
    body: `${senderName} sent you ${giftEmoji} ${giftName}`,
    data: {
      type: "gift",
      actorId: senderId,
      recipientId,
      giftTypeId,
    },
  }));

  const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(messages),
  });

  if (!expoRes.ok) return;

  const expoJson = await expoRes.json();
  const data = Array.isArray(expoJson?.data) ? expoJson.data : [];
  const invalidTokenRows: string[] = [];

  data.forEach((ticket: any, idx: number) => {
    const errCode = ticket?.details?.error;
    if (errCode === "DeviceNotRegistered") {
      const rowId = String(tokens[idx]?.id ?? "").trim();
      if (rowId) invalidTokenRows.push(rowId);
    }
  });

  if (invalidTokenRows.length > 0) {
    await adminClient
      .from("user_push_tokens")
      .update({ disabled: true, last_error: "DeviceNotRegistered" } as any)
      .in("id", invalidTokenRows);
  }
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!supabaseUrl || !serviceRole || !stripeSecretKey || !webhookSecret) {
    return json({ error: "Missing env configuration" }, 500);
  }

  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-04-10" });
  const adminClient = createClient(supabaseUrl, serviceRole);

  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "Missing stripe-signature header" }, 400);

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err: any) {
    return json({ error: `Webhook signature invalid: ${err?.message ?? "unknown"}` }, 400);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = String(session.metadata?.user_id ?? "").trim();
      const purpose = String(session.metadata?.purpose ?? "").trim();

      if (purpose === PREMIUM_PURPOSE) {
        if (userId) {
          await adminClient.from("profiles").update({ is_premium: true } as any).eq("id", userId);
        }
        return new Response("ok", { status: 200 });
      }

      if (purpose === DONATION_PURPOSE) {
        if (userId) {
          await adminClient.from("profiles").update({ is_supporter: true } as any).eq("id", userId);
        }
        return new Response("ok", { status: 200 });
      }

      if (purpose === GIFT_PURPOSE) {
        const senderId   = String(session.metadata?.sender_id    ?? "").trim();
        const recipientId = String(session.metadata?.recipient_id ?? "").trim();
        const giftTypeId  = String(session.metadata?.gift_type_id ?? "").trim();
        const message     = String(session.metadata?.message      ?? "").trim();
        if (senderId && recipientId && giftTypeId && senderId !== recipientId) {
          await adminClient.from("user_gifts" as any).insert({
            sender_id:    senderId,
            recipient_id: recipientId,
            gift_type_id: giftTypeId,
            message:      message || null,
          });

          // Best effort: push notification + in-app notification row
          try {
            await sendGiftPush(adminClient, senderId, recipientId, giftTypeId);
          } catch {}

          try {
            await adminClient.from("notifications").insert({
              user_id: recipientId,
              actor_id: senderId,
              type: "gift",
              post_id: null,
              comment_id: null,
            } as any);
          } catch {}
        }
        return new Response("ok", { status: 200 });
      }

      if (purpose === BIKE_BOOST_PURPOSE) {
        const buyerId = String(session.metadata?.buyer_id ?? "").trim();
        const cycleId = String(session.metadata?.cycle_id ?? "").trim();
        const submissionId = String(session.metadata?.submission_id ?? "").trim();
        const boostTypeId = String(session.metadata?.boost_type_id ?? "").trim();
        const message = String(session.metadata?.message ?? "").trim();

        if (buyerId && cycleId && submissionId && boostTypeId) {
          await adminClient.from("bike_of_month_boosts" as any).insert({
            cycle_id: cycleId,
            submission_id: submissionId,
            buyer_id: buyerId,
            boost_type_id: boostTypeId,
            message: message || null,
          });
        }

        return new Response("ok", { status: 200 });
      }

      if (purpose === STORE_PURPOSE) {
        if (userId) {
          const customerId = String(session.customer ?? "").trim();
          const subscriptionId = String(session.subscription ?? "").trim();
          let currentPeriodEnd: string | null = null;
          let subStatus = "active";

          if (subscriptionId) {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            currentPeriodEnd = toIsoOrNull(sub.current_period_end);
            subStatus = mapStripeStatus(sub.status);
          }

          await Promise.all([
            // Auto-approve the store account
            adminClient
              .from("business_accounts")
              .update({ status: "active", updated_at: new Date().toISOString() } as any)
              .eq("user_id", userId),
            // Record the subscription
            adminClient.from("business_subscriptions").upsert(
              {
                user_id: userId,
                tier_id: "dealer_basic",
                status: subStatus,
                stripe_customer_id: customerId,
                stripe_subscription_id: subscriptionId || null,
                current_period_end: currentPeriodEnd,
              } as any,
              { onConflict: "user_id" }
            ),
          ]);
        }
        return new Response("ok", { status: 200 });
      }

      const tierId = String(session.metadata?.tier_id ?? "dealer_basic").trim();
      const customerId = String(session.customer ?? "").trim();
      const subscriptionId = String(session.subscription ?? "").trim();

      if (userId && customerId) {
        let currentPeriodEnd: string | null = null;
        let status: string = "active";

        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          currentPeriodEnd = toIsoOrNull(sub.current_period_end);
          status = mapStripeStatus(sub.status);
        }

        await adminClient.from("business_subscriptions").upsert(
          {
            user_id: userId,
            tier_id: tierId,
            status,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId || null,
            current_period_end: currentPeriodEnd,
          } as any,
          { onConflict: "user_id" }
        );
      }
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const purpose = String(sub.metadata?.purpose ?? "").trim();
      const userId = String(sub.metadata?.user_id ?? "").trim();

      if (purpose === PREMIUM_PURPOSE && userId) {
        await adminClient
          .from("profiles")
          .update({ is_premium: isPremiumLive(sub.status) } as any)
          .eq("id", userId);
        return new Response("ok", { status: 200 });
      }

      if (purpose === STORE_PURPOSE && userId) {
        const isLive = isPremiumLive(sub.status);
        await Promise.all([
          // Revoke or restore account access based on subscription state
          adminClient
            .from("business_accounts")
            .update({ status: isLive ? "active" : "suspended", updated_at: new Date().toISOString() } as any)
            .eq("user_id", userId),
          adminClient
            .from("business_subscriptions")
            .update({
              status: mapStripeStatus(sub.status),
              stripe_subscription_id: sub.id,
              current_period_end: toIsoOrNull(sub.current_period_end),
            } as any)
            .eq("user_id", userId),
        ]);
        return new Response("ok", { status: 200 });
      }

      const customerId = String(sub.customer ?? "").trim();

      if (customerId) {
        const status = mapStripeStatus(sub.status);
        const currentPeriodEnd = toIsoOrNull(sub.current_period_end);

        await adminClient
          .from("business_subscriptions")
          .update({
            status,
            stripe_subscription_id: sub.id,
            current_period_end: currentPeriodEnd,
          } as any)
          .eq("stripe_customer_id", customerId);
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = String(invoice.subscription ?? "").trim();

      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const purpose = String(sub.metadata?.purpose ?? "").trim();
        const userId = String(sub.metadata?.user_id ?? "").trim();

        if (purpose === PREMIUM_PURPOSE && userId) {
          await adminClient.from("profiles").update({ is_premium: false } as any).eq("id", userId);
          return new Response("ok", { status: 200 });
        }
      }

      const customerId = String(invoice.customer ?? "").trim();
      if (customerId) {
        await adminClient
          .from("business_subscriptions")
          .update({ status: "past_due" } as any)
          .eq("stripe_customer_id", customerId);
      }
    }
  } catch (err: any) {
    return json({ error: err?.message ?? "Webhook handling failed" }, 500);
  }

  return new Response("ok", { status: 200 });
});
