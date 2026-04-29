import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export const SUPABASE_URL = 'https://ktufgncydxhkhfttojkh.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_bxJ_gRDrsJ-XCWWUD6NiQA_1nlPDA2B';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
