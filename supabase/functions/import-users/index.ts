// Import en masse de propriétaires/locataires par CSV. Crée un vrai compte
// auth (auth.admin.inviteUserByEmail) + la ligne profiles correspondante.
// Nécessite la service role key (auth.admin.* n'est pas accessible via
// l'API REST normale) — c'est pourquoi ça passe par une Edge Function et
// non par un insert client direct.
//
// N'envoie PAS d'email de marque (ça, c'est la Phase 5, explicitement
// reportée) : utilise le mail d'invitation Supabase par défaut. Chaque
// nouvel utilisateur reçoit donc un email d'invitation générique, pas
// encore personnalisé au branding de l'organisation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ImportRow {
  full_name: string;
  email: string;
  phone: string | null;
}

interface RowResult {
  email: string;
  status: "created" | "error";
  message?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Méthode non supportée", { status: 405, headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Non authentifié", { status: 401, headers: CORS_HEADERS });
  }

  let body: { role: string; rows: ImportRow[] };
  try {
    body = await req.json();
  } catch {
    return new Response("Corps de requête invalide", { status: 400, headers: CORS_HEADERS });
  }

  if (body.role !== "owner" && body.role !== "tenant") {
    return new Response("Rôle invalide", { status: 400, headers: CORS_HEADERS });
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return new Response("Aucune ligne à importer", { status: 400, headers: CORS_HEADERS });
  }
  if (body.rows.length > 200) {
    return new Response("Maximum 200 lignes par import", { status: 400, headers: CORS_HEADERS });
  }

  // Le client anon+JWT sert uniquement à identifier l'appelant via son
  // propre token — aucune écriture ne passe par ce client.
  const callerClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response("Session invalide", { status: 401, headers: CORS_HEADERS });
  }

  const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: callerProfile } = await adminClient
    .from("profiles")
    .select("role, organization_id")
    .eq("id", userData.user.id)
    .single();

  if (!callerProfile || !["admin", "agent"].includes(callerProfile.role)) {
    return new Response("Accès refusé", { status: 403, headers: CORS_HEADERS });
  }

  const results: RowResult[] = [];

  for (const row of body.rows) {
    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(row.email, {
      data: { full_name: row.full_name },
    });

    if (inviteError || !invited.user) {
      results.push({ email: row.email, status: "error", message: inviteError?.message ?? "Échec de l'invitation" });
      continue;
    }

    const { error: profileError } = await adminClient.from("profiles").insert({
      id: invited.user.id,
      organization_id: callerProfile.organization_id,
      role: body.role,
      full_name: row.full_name,
      email: row.email,
      phone: row.phone,
    });

    if (profileError) {
      results.push({ email: row.email, status: "error", message: profileError.message });
      continue;
    }

    results.push({ email: row.email, status: "created" });
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
