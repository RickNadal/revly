import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    return new Response("Missing env", { status: 500 });
  }

  const supabase = createClient(url, serviceRoleKey);

  const { error } = await supabase.rpc("cleanup_sold_listings");
  if (error) return new Response(error.message, { status: 500 });

  return new Response("ok", { status: 200 });
});