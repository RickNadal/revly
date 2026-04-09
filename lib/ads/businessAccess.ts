import { supabase } from "../supabase";

export type BusinessTier = {
  id: string;
  name: string;
  monthly_price_cents: number;
  max_active_campaigns: number;
  discover_enabled: boolean;
  following_enabled: boolean;
  weight_multiplier: number;
};

export type BusinessAccount = {
  user_id: string;
  business_name: string;
  contact_email: string;
  tier_id: string;
  status: "pending_review" | "active" | "rejected" | "suspended";
};

export type BusinessSubscription = {
  user_id: string;
  tier_id: string;
  status: "pending_payment" | "trialing" | "active" | "past_due" | "canceled" | "inactive";
  current_period_end: string | null;
};

export type BusinessAccessSummary = {
  userId: string | null;
  tier: BusinessTier | null;
  account: BusinessAccount | null;
  subscription: BusinessSubscription | null;
  activeCampaignCount: number;
  canAdvertise: boolean;
  nextStep: "sign-in" | "apply" | "review" | "pay" | "manage";
};

function isSubscriptionLive(subscription: BusinessSubscription | null) {
  if (!subscription) return false;
  if (subscription.status !== "active" && subscription.status !== "trialing") return false;
  if (!subscription.current_period_end) return true;
  return new Date(subscription.current_period_end).getTime() > Date.now();
}

export async function getBusinessAccessSummary(): Promise<BusinessAccessSummary> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;

  if (!session) {
    return {
      userId: null,
      tier: null,
      account: null,
      subscription: null,
      activeCampaignCount: 0,
      canAdvertise: false,
      nextStep: "sign-in",
    };
  }

  const userId = session.user.id;

  const [accountRes, subRes] = await Promise.all([
    supabase.from("business_accounts").select("user_id, business_name, contact_email, tier_id, status").eq("user_id", userId).maybeSingle(),
    supabase.from("business_subscriptions").select("user_id, tier_id, status, current_period_end").eq("user_id", userId).maybeSingle(),
  ]);

  const account = (accountRes.data ?? null) as BusinessAccount | null;
  const subscription = (subRes.data ?? null) as BusinessSubscription | null;
  const tierId = subscription?.tier_id ?? account?.tier_id ?? "dealer_basic";

  const [tierRes, activeCampaignsRes] = await Promise.all([
    supabase.from("business_tiers").select("id, name, monthly_price_cents, max_active_campaigns, discover_enabled, following_enabled, weight_multiplier").eq("id", tierId).maybeSingle(),
    supabase.from("ad_campaigns").select("id", { count: "exact", head: true }).eq("owner_user_id", userId).in("status", ["draft", "pending_review", "active", "paused"]),
  ]);

  const tier = (tierRes.data ?? null) as BusinessTier | null;
  const activeCampaignCount = activeCampaignsRes.count ?? 0;
  const canAdvertise = !!account && account.status === "active" && isSubscriptionLive(subscription);

  let nextStep: BusinessAccessSummary["nextStep"] = "apply";
  if (!account) nextStep = "apply";
  else if (account.status === "pending_review") nextStep = "review";
  else if (account.status !== "active") nextStep = "apply";
  else if (!isSubscriptionLive(subscription)) nextStep = "pay";
  else nextStep = "manage";

  return {
    userId,
    tier,
    account,
    subscription,
    activeCampaignCount,
    canAdvertise,
    nextStep,
  };
}