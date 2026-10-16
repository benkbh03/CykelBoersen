import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
/* Fast version (16. okt. 2026). Uden nummer fik alle besøgende den nyeste
   udgave i det øjeblik Supabase udgav den, uden at nogen havde set den køre
   her: en ny hovedversion kunne vælte siden, og en kompromitteret pakke ville
   ramme alle. Opdatér bevidst, og test før merge. */
import { SUPABASE_ENV } from './env.js';

// Produktion eller staging, afgjort af domænet. Se js/env.js.
export const SUPABASE_URL = SUPABASE_ENV.url;
export const SUPABASE_KEY = SUPABASE_ENV.key;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* Eksplicit feltliste til session-state-profil — bruges hver gang vi henter
   currentProfile. Holder bio/dealer_description/services/opening_hours ude af
   hot path (de er kun nødvendige på faktiske profil-sider). Sparer egress
   ved hver auth-event og tab-fokus. */
export const PROFILE_SESSION_FIELDS = 'id, name, shop_name, seller_type, city, verified, id_verified, email_verified, is_admin, avatar_url, avatar_thumb_url, last_seen, admin_can_create_listings, admin_authorized_at';
