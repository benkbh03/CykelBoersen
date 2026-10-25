// Supabase Edge Function: admin-actions
// Server-side gating af admin-handlinger (godkend/afvis forhandler, godkend/afvis ID).
// Erstatter de direkte supabase.from('profiles').update(...) kald fra browseren der
// gjorde alle is_admin-tjek til UI-only.
//
// Deploy: supabase functions deploy admin-actions
//
// Påkrævede secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-sat)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_ACTIONS = new Set([
  "approve_dealer", "reject_dealer", "revoke_dealer",
  "approve_id",     "reject_id",
  "suspend_user",   "unsuspend_user",
  "delete_user",
]);

// Standard-varighed for en suspendering hvis ingen angives.
const DEFAULT_SUSPEND_DAYS = 30;

/**
 * Skriver til moderation_log. Kaldes for HVER handling, ikke kun de hårde.
 *
 * Hvorfor den findes: indtil 14. september var den eneste måde at stoppe en
 * bruger permanent sletning, og sletningen fjerner også `messages`. Trykkede
 * man Slet på en svindler, forsvandt svindelbeskeden med kontoen. Spurgte
 * politiet tre måneder senere, fandtes der intet.
 *
 * Fejler loggen, fortsætter handlingen alligevel. En log der kan blokere
 * moderation, er værre end ingen log: så lader man være med at moderere.
 * Men vi råber i konsollen, så det kan opdages.
 */
async function logModeration(
  supa,
  entry: {
    admin_id: string; admin_email?: string | null;
    action: string; target_user_id: string;
    target_email?: string | null; reason?: string | null;
    snapshot?: unknown;
  },
) {
  try {
    const { error } = await supa.from("moderation_log").insert(entry);
    if (error) console.error("KUNNE IKKE SKRIVE MODERATIONSLOG:", error, entry);
  } catch (err) {
    console.error("KUNNE IKKE SKRIVE MODERATIONSLOG:", err, entry);
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Tømmer én "mappe" i en bucket. Samme funktion som i delete-account; havde
 * den ligget ét sted, var dette hul ikke opstået. Fejl kastes ikke videre —
 * en fil der ikke kan fjernes må ikke forhindre at kontoen bliver slettet.
 */
async function emptyPrefix(supa, bucket: string, prefix: string, problems: string[], depth = 0) {
  if (depth > 3) return;                       // værn mod uventet dyb struktur
  try {
    const { data, error } = await supa.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) { problems.push(`${bucket}/${prefix}: ${error.message}`); return; }
    if (!data || data.length === 0) return;

    /* list() er IKKE rekursiv. Poster uden id er "mapper", og efter at
       udlejnings- og admin-billeder flyttede til <bruger-id>/rental/… og
       <bruger-id>/admin-onbehalf/… ligger filerne et niveau nede. Uden
       dette gennemløb ville de blive liggende efter en kontosletning. */
    const files = data.filter((o: { id: string | null }) => o.id).map((o: { name: string }) => `${prefix}/${o.name}`);
    if (files.length > 0) {
      const { error: rmErr } = await supa.storage.from(bucket).remove(files);
      if (rmErr) problems.push(`${bucket}/${prefix}: ${rmErr.message}`);
    }
    for (const folder of data.filter((o: { id: string | null }) => !o.id)) {
      await emptyPrefix(supa, bucket, `${prefix}/${folder.name}`, problems, depth + 1);
    }
  } catch (e) {
    problems.push(`${bucket}/${prefix}: ${String(e)}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    // ── Verificér caller-JWT ─────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return jsonResponse({ error: "Ikke logget ind" }, 401);

    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user: caller }, error: authErr } = await supa.auth.getUser(jwt);
    if (authErr || !caller) return jsonResponse({ error: "Ugyldig session" }, 401);

    // ── Verificér admin-status ──────────────────────────────
    const { data: callerProfile } = await supa
      .from("profiles")
      .select("is_admin")
      .eq("id", caller.id)
      .single();

    if (!callerProfile?.is_admin) {
      return jsonResponse({ error: "Kræver admin-rettigheder" }, 403);
    }

    // ── Parse handling ──────────────────────────────────────
    const { action, target_user_id, reason, days } = await req.json();

    if (!action || !ALLOWED_ACTIONS.has(action)) {
      return jsonResponse({ error: "Ugyldig handling" }, 400);
    }
    if (!target_user_id || typeof target_user_id !== "string") {
      return jsonResponse({ error: "target_user_id påkrævet" }, 400);
    }

    /* Hentes FØR handlingen. Efter en sletning findes hverken profilen
       eller auth-brugeren, og så er der ikke noget at skrive i loggen.

       `select("*")` frem for en kolonneliste: profiles har fået kolonner
       gennem hele projektet, og en forkert stavet kolonne ville få hele
       opslaget til at fejle og efterlade et tomt snapshot. Rækken er lille,
       og den skal alligevel gemmes i sin helhed. */
    const { data: targetProfile } = await supa
      .from("profiles").select("*").eq("id", target_user_id).maybeSingle();

    /* E-mailen bor i auth.users, ikke i profiles. Den er det eneste der
       kan genkende den samme person når de kommer tilbage med en ny konto. */
    let targetEmail: string | null = null;
    try {
      const { data: authUser } = await supa.auth.admin.getUserById(target_user_id);
      targetEmail = authUser?.user?.email ?? null;
    } catch { /* uden mail er loggen stadig bedre end ingen log */ }

    /* Uden det her opdaterede en handling mod et ukendt id nul raekker,
       skrev alligevel en logpost og svarede ok: true. */
    if (!targetProfile && action !== "delete_user") {
      return jsonResponse({ error: "Bruger findes ikke" }, 404);
    }

    const logBase = {
      admin_id:     caller.id,
      admin_email:  caller.email ?? null,
      action,
      target_user_id,
      target_email: targetEmail,
      reason:       typeof reason === "string" && reason.trim() ? reason.trim() : null,
    };

    let updates: Record<string, unknown> = {};
    switch (action) {
      case "approve_dealer":
        updates = { verified: true, seller_type: "dealer" };
        break;
      case "reject_dealer":
        updates = { seller_type: "private", verified: false };
        break;
      case "revoke_dealer":
        updates = { verified: false };
        break;
      case "approve_id":
        updates = { id_verified: true, id_pending: false };
        break;
      case "reject_id":
        updates = { id_pending: false, id_doc_url: null };
        break;

      /* Suspendering. Fandtes ikke før 14. september, hvor den eneste vej til
         at stoppe en bruger var permanent sletning. Valget stod derfor mellem
         at overreagere og ikke at gøre noget.

         En suspenderet bruger kan stadig logge ind og læse sine egne beskeder
         og annoncer. Det er med vilje: de skal kunne se hvorfor. De kan bare
         ikke skrive til nogen, oprette annoncer eller anmelde nogen. Se
         is_suspended() i add_moderation_log_and_suspension.sql. */
      case "suspend_user":
      case "unsuspend_user": {
        if (target_user_id === caller.id) {
          return jsonResponse({ error: "Du kan ikke suspendere dig selv" }, 400);
        }
        /* En suspenderet admin ophaever bare sig selv igen: suspendering
           roerer ikke is_admin. Vaerktoejet ville give falsk tryghed, saa
           det afvises helt frem for at lade som om det virkede. */
        if (targetProfile?.is_admin) {
          return jsonResponse({ error: "Kan ikke suspendere en admin. Fjern admin-rettigheden foerst." }, 400);
        }

        /* Annoncerne skjules ved suspendering (25. okt.). Før skulle admin
           huske at skjule dem i hånden, og en glemt svindelannonce blev
           stående. Id'erne gemmes i loggens snapshot, så ophævelsen kan sætte
           præcis de samme aktive igen og ikke dem brugeren selv havde skjult. */
        let skjulteAnnoncer: string[] = [];
        let genaktiveret: string[] = [];

        if (action === "unsuspend_user") {
          await supa.from("user_suspensions").delete().eq("user_id", target_user_id);

          /* Alle suspenderinger siden sidste ophævelse, ikke kun den seneste:
             forlænger admin en suspendering, skjuler anden runde ingenting,
             fordi annoncerne allerede er skjult, og så ville listen være tom. */
          const { data: poster } = await supa.from("moderation_log")
            .select("action, snapshot")
            .eq("target_user_id", target_user_id)
            .in("action", ["suspend_user", "unsuspend_user"])
            .order("created_at", { ascending: false })
            .limit(50);
          const ids: string[] = [];
          for (const p of poster ?? []) {
            if (p.action === "unsuspend_user") break;
            if (Array.isArray(p.snapshot?.skjulte_annoncer)) ids.push(...p.snapshot.skjulte_annoncer);
          }
          if (ids.length > 0) {
            /* Kun dem der stadig er skjulte og hverken solgt eller slettet
               imens. user_id med som ekstra værn mod et forkert snapshot. */
            const { data: igen, error: igenErr } = await supa.from("bikes")
              .update({ is_active: true })
              .in("id", ids)
              .eq("user_id", target_user_id)
              .eq("is_active", false)
              .is("deleted_at", null)
              .is("sold_via", null)
              .select("id");
            if (igenErr) console.error("Kunne ikke genaktivere annoncer:", igenErr);
            genaktiveret = (igen ?? []).map((b: { id: string }) => b.id);
          }
        } else {
          const d = Number.isFinite(Number(days)) && Number(days) > 0
            ? Math.min(Number(days), 3650)          // 10 år er i praksis permanent
            : DEFAULT_SUSPEND_DAYS;
          const until = new Date(Date.now() + d * 86400000).toISOString();
          /* Begrundelsen bor KUN her og i moderation_log. Foerste udkast lagde
             den paa profiles, hvor SELECT er USING (true) — altsaa kunne en
             admins fritekst om en navngiven person hentes med anon-noeglen. */
          const { error: suspErr } = await supa.from("user_suspensions").upsert({
            user_id: target_user_id,
            until,
            reason: logBase.reason,
            created_by: caller.id,
          });
          if (suspErr) {
            console.error("Suspendering fejlede:", suspErr);
            return jsonResponse({ error: "Kunne ikke suspendere brugeren" }, 500);
          }

          /* Suspenderingen står fast, selv hvis dette fejler: så er brugeren
             stoppet, og admin får besked om at skjule annoncerne i hånden. */
          const { data: skjult, error: skjulErr } = await supa.from("bikes")
            .update({ is_active: false })
            .eq("user_id", target_user_id)
            .eq("is_active", true)
            .select("id");
          if (skjulErr) {
            console.error("Kunne ikke skjule annoncer ved suspendering:", skjulErr);
            await logModeration(supa, { ...logBase, snapshot: { profil: targetProfile ?? null, dage: days ?? null, skjul_fejl: skjulErr.message } });
            return jsonResponse({ ok: true, action, target_user_id, warning: "Brugeren er suspenderet, men annoncerne kunne ikke skjules. Skjul dem i hånden." });
          }
          skjulteAnnoncer = (skjult ?? []).map((b: { id: string }) => b.id);
        }

        await logModeration(supa, {
          ...logBase,
          snapshot: {
            profil: targetProfile ?? null,
            dage: days ?? null,
            ...(action === "suspend_user" ? { skjulte_annoncer: skjulteAnnoncer } : { genaktiverede_annoncer: genaktiveret }),
          },
        });
        return jsonResponse({
          ok: true, action, target_user_id,
          skjulte_annoncer: skjulteAnnoncer.length,
          genaktiverede_annoncer: genaktiveret.length,
        });
      }

      case "delete_user": {
        // Beskyt mod selvsletning — admin kan ikke slette sig selv
        // (ville miste admin-access og kunne ikke gendannes uden DB-adgang)
        if (target_user_id === caller.id) {
          return jsonResponse({ error: "Du kan ikke slette dig selv" }, 400);
        }

        /* LOG FØR SLETNING. Rækkefølgen er hele pointen.
           Oprydningen nedenfor sletter `messages` for både afsender og
           modtager, så trykker man Slet på en svindler, forsvinder
           svindelbeskeden med kontoen. Snapshottet her er det eneste der
           er tilbage bagefter.

           De 20 seneste sendte beskeder: nok til at vise mønstret uden at
           gemme hele korrespondancen. Er der mere brug for, skal det trækkes
           inden sletningen, ikke efter. */
        const { data: sidsteBeskeder } = await supa
          .from("messages")
          .select("id, receiver_id, bike_id, content, created_at")
          .eq("sender_id", target_user_id)
          .order("created_at", { ascending: false })
          .limit(20);

        const { count: antalBeskeder } = await supa
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("sender_id", target_user_id);

        await logModeration(supa, {
          ...logBase,
          snapshot: {
            profil:            targetProfile ?? null,
            antal_sendte:      antalBeskeder ?? null,
            sidste_20_sendte:  sidsteBeskeder ?? [],
            slettet_tidspunkt: new Date().toISOString(),
          },
        });

        // Cascading sletning — samme logik som delete-account men gated til admin
        const { data: bikes } = await supa
          .from("bikes").select("id").eq("user_id", target_user_id);
        const bikeIds = (bikes || []).map((b: { id: string }) => b.id);

        /* Storage FØR rækkerne, mens bikeIds stadig kendes. Denne funktion
           slettede tidligere kun databaserækker, i modsætning til
           delete-account: en admin-slettet brugers billeder blev liggende i
           en offentligt læsbar bucket og kunne hentes på deres URL for altid.
           Best effort — en enkelt fil må ikke blokere sletningen. */
        const storageProblems: string[] = [];
        await emptyPrefix(supa, "avatars", target_user_id, storageProblems);
        for (const bikeId of bikeIds) {
          await emptyPrefix(supa, "bike-images", bikeId, storageProblems);
        }
        await emptyPrefix(supa, "bike-images", target_user_id, storageProblems);
        await emptyPrefix(supa, "bike-images", `rental/${target_user_id}`, storageProblems);
        await emptyPrefix(supa, "id-documents", target_user_id, storageProblems);
        if (storageProblems.length > 0) {
          console.error("Bruger slettet, men disse filer blev liggende:", storageProblems);
        }

        if (bikeIds.length > 0) {
          await supa.from("saved_bikes").delete().in("bike_id", bikeIds);
          await supa.from("bike_images").delete().in("bike_id", bikeIds);
        }
        await supa.from("saved_searches").delete().eq("user_id", target_user_id);
        await supa.from("saved_bikes").delete().eq("user_id", target_user_id);
        await supa.from("reviews").delete()
          .or(`reviewer_id.eq.${target_user_id},reviewed_user_id.eq.${target_user_id}`);
        await supa.from("messages").delete()
          .or(`sender_id.eq.${target_user_id},receiver_id.eq.${target_user_id}`);
        await supa.from("dealer_applications").delete().eq("user_id", target_user_id);
        await supa.from("id_applications").delete().eq("user_id", target_user_id);
        if (bikeIds.length > 0) {
          await supa.from("bikes").delete().eq("user_id", target_user_id);
        }
        await supa.from("profiles").delete().eq("id", target_user_id);

        const { error: deleteAuthErr } = await supa.auth.admin.deleteUser(target_user_id);
        if (deleteAuthErr) {
          console.error("Delete auth user error:", deleteAuthErr);
          return jsonResponse({ error: "Kunne ikke slette auth-bruger: " + deleteAuthErr.message }, 500);
        }

        console.log(`Admin ${caller.id} slettede bruger ${target_user_id}`);
        return jsonResponse({ ok: true, action, target_user_id });
      }
    }

    const { error: updateErr } = await supa
      .from("profiles")
      .update(updates)
      .eq("id", target_user_id);

    if (updateErr) {
      console.error("Update fejl:", updateErr);
      return jsonResponse({ error: "Kunne ikke opdatere profil" }, 500);
    }

    /* Log ALLE handlinger, ikke kun de hårde. En godkendt forhandler der
       senere viser sig at være svindel, er lige så vigtig at kunne datere
       som en sletning. Her efter opdateringen, fordi der intet er at logge
       hvis den fejlede. */
    await logModeration(supa, {
      ...logBase,
      snapshot: { profil_foer: targetProfile ?? null, aendringer: updates },
    });

    console.log(`Admin ${caller.id} udførte ${action} på ${target_user_id}`);
    return jsonResponse({ ok: true, action, target_user_id });

  } catch (err) {
    console.error("Uventet fejl:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
