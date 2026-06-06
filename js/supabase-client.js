import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export const SUPABASE_URL = 'https://ktufgncydxhkhfttojkh.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_bxJ_gRDrsJ-XCWWUD6NiQA_1nlPDA2B';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* Eksplicit feltliste til session-state-profil — bruges hver gang vi henter
   currentProfile. Holder bio/dealer_description/services/opening_hours ude af
   hot path (de er kun nødvendige på faktiske profil-sider). Sparer egress
   ved hver auth-event og tab-fokus. */
export const PROFILE_SESSION_FIELDS = 'id, name, shop_name, seller_type, city, verified, id_verified, email_verified, is_admin, avatar_url, avatar_thumb_url, last_seen, admin_can_create_listings, admin_authorized_at';
