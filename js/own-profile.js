/* ============================================================
   EGEN PROFIL: læs og skriv uden at ramme de skjulte kolonner

   Ti kolonner på profiles (email, cvr, id_doc_url, stripe-felterne m.fl.)
   kan ikke læses med den offentlige nøgle (supabase/sql/
   hide_private_profile_columns.sql). Derfor:

   - select('*') på profiles fejler altid. Brug PROFILE_PUBLIC_FIELDS.
   - Egne skjulte felter hentes med get_my_private_profile().
   - upsert() med en skjult kolonne fejler også, fordi ON CONFLICT DO UPDATE
     SET cvr = EXCLUDED.cvr kræver læseret på cvr. En almindelig UPDATE gør
     ikke. Brug saveOwnProfileFields().

   Ny fil med vilje: statiske imports har ingen ?v=, og en ny eksport i et
   eksisterende modul kan møde en cachet udgave uden den.
   ============================================================ */

/* Samme liste som GRANT SELECT i hide_private_profile_columns.sql.
   Kommer der en ny offentlig kolonne, skal den begge steder. */
export const PROFILE_PUBLIC_FIELDS =
  'id, name, city, seller_type, shop_name, verified, created_at, is_admin, '
  + 'id_verified, address, avatar_url, bio, last_seen, email_verified, '
  + 'lat, lng, postcode, location_precision, phone, '
  + 'offers_financing, offers_tradein, opening_hours, website, facebook, '
  + 'instagram, services, featured_until, '
  + 'admin_can_create_listings, admin_authorized_at, '
  + 'hours_optout, offers_optout, services_optout, social_optout, '
  + 'avatar_thumb_url, stripe_account_status';

/* Hele den indloggede brugers profil, inkl. de skjulte felter.
   Returnerer null hvis den offentlige del ikke kunne hentes: så må siden
   ikke tegne en formular, for et Gem ville skrive tomme felter over profilen.
   De skjulte felter er kun pynt (abonnementsboksen), så fejler de, tegnes
   siden uden dem. */
export async function loadOwnProfile(supabase, userId) {
  const [pub, priv] = await Promise.all([
    supabase.from('profiles').select(PROFILE_PUBLIC_FIELDS).eq('id', userId).single(),
    supabase.rpc('get_my_private_profile').maybeSingle(),
  ]);
  if (pub.error || !pub.data) return null;
  return { ...pub.data, ...(priv.data || {}) };
}

/* Skriv felter på brugerens egen række, og opret den hvis den mangler.
   Rækken findes næsten altid (triggeren handle_new_user opretter den ved
   signup). Først en INSERT der ikke gør noget hvis rækken findes
   (ON CONFLICT DO NOTHING kræver ingen læseret), så en almindelig UPDATE. */
export async function saveOwnProfileFields(supabase, userId, fields) {
  const ins = await supabase.from('profiles')
    .upsert({ id: userId, ...fields }, { onConflict: 'id', ignoreDuplicates: true });
  if (ins.error) return { error: ins.error };
  const upd = await supabase.from('profiles').update(fields).eq('id', userId);
  return { error: upd.error };
}
