import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type PushType = "like" | "comment" | "follow" | "mention";

type PushRequest = {
  recipientUserId?: string;
  type?: PushType;
  postId?: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function buildBody(type: PushType, actorName: string) {
  if (type === "follow") return `${actorName} started following you`;
  if (type === "like") return `${actorName} liked your post`;
  if (type === "mention") return `${actorName} mentioned you in a post`;
  return `${actorName} commented on your post`;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !anon || !serviceRole) return json({ error: "Missing env" }, 500);

  const authHeader = req.headers.get("authorization") ?? "";

  const userClient = createClient(url, anon, {
    global: {
      headers: {
        authorization: authHeader,
      },
    },
  });

  const adminClient = createClient(url, serviceRole);

  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user) return json({ error: "Unauthorized" }, 401);

  const actorId = authData.user.id;

  let body: PushRequest;
  try {
    body = (await req.json()) as PushRequest;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const recipientUserId = String(body.recipientUserId ?? "").trim();
  const type = body.type;

  if (!recipientUserId || !type) {
    return json({ error: "recipientUserId and type are required" }, 400);
  }

  if (recipientUserId === actorId) {
    return json({ ok: true, skipped: "self" }, 200);
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("full_name")
    .eq("id", actorId)
    .maybeSingle();

  const actorName = String(profile?.full_name ?? authData.user.user_metadata?.full_name ?? "Rider").trim() || "Rider";

  const { data: tokens, error: tokenErr } = await adminClient
    .from("user_push_tokens")
    .select("id, expo_push_token")
    .eq("user_id", recipientUserId)
    .eq("disabled", false);

  if (tokenErr) return json({ error: tokenErr.message }, 500);
  if (!tokens || tokens.length === 0) return json({ ok: true, delivered: 0 }, 200);

  const messages = tokens.map((row: any) => ({
    to: row.expo_push_token,
    sound: "default",
    title: "Oranga",
    body: buildBody(type, actorName),
    data: {
      type,
      postId: body.postId ?? null,
      actorId,
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

  if (!expoRes.ok) {
    const txt = await expoRes.text();
    return json({ error: txt || "Push send failed" }, 502);
  }

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
      .update({ disabled: true, last_error: "DeviceNotRegistered" })
      .in("id", invalidTokenRows);
  }

  return json({ ok: true, delivered: messages.length }, 200);
});
