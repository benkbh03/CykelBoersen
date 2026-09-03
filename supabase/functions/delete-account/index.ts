// Supabase Edge Function: delete-account
//
// Sletter en brugers konto og alt der hører til den. Kaldes kun af brugeren
// selv; userId stammer udelukkende fra det kryptografisk verificerede JWT.
//
// STORAGE ER LIGE SÅ VIGTIGT SOM RÆKKERNE
// Funktionen slettede tidligere kun databaserækker. Profilbilledet og alle
// annoncebilleder blev liggende i to offentlige buckets og kunne stadig
// hentes af enhver med URL'en. Vi lover sletning i privatlivspolitikken, og
// et billede der stadig kan hentes, er ikke slettet.
//
// FK-CASCADES GØR DET MESTE AF ARBEJDET
// Disse tabeller peger på profiles(id) eller auth.users(id) med
// ON DELETE CASCADE og ryddes derfor automatisk når profilen og
// auth-brugeren slettes til sidst. De skal IKKE slettes eksplicit:
//   price_drop_watches, dealer_followers, free_boosts, rental_bookings,
//   rental_items (og rental_item_images via item_id), dealer_feeds,
//   rate_limits, bike_price_history (via bikes)
// Tabellerne herunder slettes eksplicit, fordi de enten mangler en FK eller
// refererer brugeren via mere end én kolonne.
//
// Deploy: Supabase Dashboard → Edge Functions → delete-account → Deploy.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Supa = ReturnType<typeof createClient>;

/**
 * Tømmer én "mappe" i en bucket. Storage har ingen mapper i virkeligheden —
 * kun nøgler med skråstreger i — så vi lister præfikset og fjerner det vi får.
 * Fejl kastes ikke videre: en enkelt fil der ikke kan fjernes, må ikke
 * forhindre at kontoen bliver slettet. Den rapporteres i stedet tilbage.
 */
async function emptyPrefix(supa: Supa, bucket: string, prefix: string, problems: string[]) {
  try {
    const { data, error } = await supa.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) { problems.push(`${bucket}/${prefix}: ${error.message}`); return; }
    if (!data || data.length === 0) return;

    // list() returnerer også "mapper" som poster uden id. Dem springer vi over;
    // de eneste præfikser vi bruger er ét niveau dybe.
    const paths = data.filter((o) => o.id).map((o) => `${prefix}/${o.name}`);
    if (paths.length === 0) return;

    const { error: rmErr } = await supa.storage.from(bucket).remove(paths);
    if (rmErr) problems.push(`${bucket}/${prefix}: ${rmErr.message}`);
  } catch (e) {
    problems.push(`${bucket}/${prefix}: ${String(e)}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // Verificér JWT KRYPTOGRAFISK via Supabase Auth — ikke kun base64-afkodning af
  // payloaden. userId stammer udelukkende fra det verificerede token, så en bruger
  // kan kun slette sin EGEN konto (ingen forfalskning af 'sub' → ingen IDOR).
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: { user }, error: authErr } = await adminClient.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = user.id;

  try {
    // 1. Hent brugerens cykler. Også de blødt slettede (deleted_at sat): de
    //    ligger stadig i tabellen med user_id, og deres billeder ligger stadig
    //    i bucketen.
    const { data: bikes } = await adminClient
      .from("bikes").select("id").eq("user_id", userId);
    const bikeIds = (bikes || []).map((b: { id: string }) => b.id);

    // 2. Storage. Gøres FØR rækkerne slettes, mens vi stadig kender bikeIds.
    //    Best effort: et billede der ikke kan fjernes, må ikke blokere for at
    //    brugeren får slettet sin konto. Problemerne returneres i stedet, så de
    //    kan ses i function-loggen og ryddes op manuelt.
    const storageProblems: string[] = [];

    // avatars/<userId>/ — avatar.webp, avatar-thumb.webp og evt. gamle
    // avatar.jpg/.png fra før profilbilleder blev normaliseret til webp.
    await emptyPrefix(adminClient, "avatars", userId, storageProblems);

    // bike-images/<bikeId>/ — ét præfiks pr. annonce, inkl. thumbnails.
    for (const bikeId of bikeIds) {
      await emptyPrefix(adminClient, "bike-images", bikeId, storageProblems);
    }

    // bike-images/rental/<userId>/ — udlejningsbilleder ligger under et andet
    // præfiks end annoncebilleder (se js/rental-create.js).
    await emptyPrefix(adminClient, "bike-images", `rental/${userId}`, storageProblems);

    // id-documents/<userId>/ — ID-verifikationsdokumenter. Den mest følsomme
    // bucket vi har, og den blev overset da denne oprydning blev skrevet:
    // dokumenterne overlevede kontosletningen. Bucket'en refereres ikke fra
    // frontenden længere, men gamle filer kan stadig ligge der.
    await emptyPrefix(adminClient, "id-documents", userId, storageProblems);

    // 3. Slet FK-afhængigheder til cykler
    if (bikeIds.length > 0) {
      await adminClient.from("saved_bikes").delete().in("bike_id", bikeIds);
      await adminClient.from("bike_images").delete().in("bike_id", bikeIds);
    }

    // 4. Slet brugerens øvrige data
    await adminClient.from("saved_searches").delete().eq("user_id", userId);
    await adminClient.from("saved_bikes").delete().eq("user_id", userId);
    await adminClient.from("reviews").delete().or(`reviewer_id.eq.${userId},reviewed_user_id.eq.${userId}`);
    await adminClient.from("messages").delete().or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
    await adminClient.from("dealer_applications").delete().eq("user_id", userId);
    await adminClient.from("id_applications").delete().eq("user_id", userId);

    // 5. boost_orders ANONYMISERES i stedet for at blive slettet.
    //    Rækkerne er kvitteringer for gennemførte betalinger, og der er
    //    bogføringspligt på dem. Sletteretten går ikke forud for den pligt,
    //    men koblingen til personen er ikke nødvendig for regnskabet — så vi
    //    fjerner user_id og beholder beløb, dato og Stripe-session-id.
    //    (Tabellen har ingen FK til profiles, så den cascader ikke af sig selv.)
    await adminClient.from("boost_orders").update({ user_id: null }).eq("user_id", userId);

    // 6. Slet cykler og profil. Profil-sletningen udløser cascaden der rydder
    //    price_drop_watches, dealer_followers, free_boosts, rental_bookings,
    //    rental_items og dealer_feeds.
    if (bikeIds.length > 0) {
      await adminClient.from("bikes").delete().eq("user_id", userId);
    }
    await adminClient.from("profiles").delete().eq("id", userId);

    // 7. Slet auth-bruger sidst
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) throw new Error(deleteError.message);

    if (storageProblems.length > 0) {
      console.error("Kontoen er slettet, men disse filer blev liggende:", storageProblems);
    }

    return new Response(JSON.stringify({ ok: true, storageProblems }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Fejl ved sletning:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
