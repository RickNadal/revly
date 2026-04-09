import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(supabaseUrl, supabaseKey);

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const thirtyHoursAgo = new Date(now.getTime() - 36 * 60 * 60 * 1000);

    // Find all campaigns that were disabled more than 36 hours ago
    const { data: campaignsToReEnable, error: selectError } = await supabase
      .from("ad_campaigns")
      .select("id, owner_user_id, sponsor_type, title, is_active, disabled_at, status")
      .eq("is_active", false)
      .not("disabled_at", "is", null)
      .lt("disabled_at", thirtyHoursAgo.toISOString())
      .limit(1000);

    if (selectError) {
      console.error("Select error:", selectError);
      return new Response(
        JSON.stringify({ error: "Failed to query campaigns", details: selectError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const campaigns = (campaignsToReEnable ?? []) as any[];
    console.log(`Found ${campaigns.length} campaigns to re-enable`);

    if (campaigns.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No campaigns to re-enable", count: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Re-enable campaigns
    const { error: updateError, data: updated } = await supabase
      .from("ad_campaigns")
      .update({ is_active: true, disabled_at: null })
      .in(
        "id",
        campaigns.map((c) => c.id)
      )
      .select("id, owner_user_id, sponsor_type, title");

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update campaigns", details: updateError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully re-enabled ${campaigns.length} campaigns`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Re-enabled ${campaigns.length} campaigns after 36-hour timeout`,
        count: campaigns.length,
        campaigns: (updated ?? []).map((c: any) => ({ id: c.id, title: c.title, type: c.sponsor_type })),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
