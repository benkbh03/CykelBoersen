/* Handler: én kilde til "har de to handlet", "Handler afsluttet" og fanen
   Handler.

   Før talte seks steder hver for sig ✅-beskeder, og en besked kan ikke
   annulleres. Nu er en handel en række i trades (supabase/sql/add_trades.sql)
   med status 'gennemført' eller 'annulleret'. Databasen opretter rækken, når
   sælgeren sender ✅-beskeden, og annullerer den, når annoncen sættes aktiv
   igen. Frontenden læser kun.

   Er add_trades.sql ikke kørt endnu, findes tabellen ikke. Så falder vi
   tilbage til ✅-beskederne, som før, i stedet for at vise nul handler og
   blokere alle vurderinger i tiden mellem merge og migration.

   Ny fil med vilje: se cache-reglen i CLAUDE.md. */

const TRADE_COLS = 'id, bike_id, seller_id, buyer_id, status, created_at, cancelled_at';

function tableMissing(error) {
  if (!error) return false;
  const msg = String(error.message || '');
  return error.code === '42P01' || error.code === 'PGRST205'
    || (/trades/.test(msg) && /does not exist|schema cache|not find/i.test(msg));
}

// Gammel model: seneste ✅-besked pr. annonce, afsender = sælger.
function tradesFromMessages(msgs) {
  const seen = new Set();
  return (msgs || [])
    .filter((m) => m.bike_id && !seen.has(m.bike_id) && seen.add(m.bike_id))
    .map((m) => ({
      id: null, bike_id: m.bike_id, seller_id: m.sender_id, buyer_id: m.receiver_id,
      status: 'gennemført', created_at: m.created_at, cancelled_at: null,
    }));
}

/* Alle handler hvor brugeren er køber eller sælger, nyeste først. Både
   gennemførte og annullerede. */
export async function fetchTradesFor(supabase, userId) {
  const { data, error } = await supabase.from('trades')
    .select(TRADE_COLS)
    .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (!error) return data || [];
  if (!tableMissing(error)) throw error;

  const { data: msgs, error: e2 } = await supabase.from('messages')
    .select('bike_id, sender_id, receiver_id, created_at')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .ilike('content', '✅%accepteret%')
    .order('created_at', { ascending: false });
  if (e2) throw e2;
  return tradesFromMessages(msgs);
}

export function completedTrades(trades) {
  return (trades || []).filter((t) => t.status === 'gennemført');
}

/* Seneste gennemførte handel mellem to brugere, eller null. Afgør om de
   må vurdere hinanden (databasen tjekker det samme igen ved indsættelse). */
export async function findCompletedTradeWith(supabase, meId, otherId) {
  const pair = `and(seller_id.eq.${meId},buyer_id.eq.${otherId}),and(seller_id.eq.${otherId},buyer_id.eq.${meId})`;
  const { data, error } = await supabase.from('trades')
    .select(TRADE_COLS)
    .eq('status', 'gennemført')
    .or(pair)
    .order('created_at', { ascending: false })
    .limit(1);
  if (!error) return data?.[0] || null;
  if (!tableMissing(error)) throw error;

  const { data: msgs, error: e2 } = await supabase.from('messages')
    .select('bike_id, sender_id, receiver_id, created_at')
    .or(`and(sender_id.eq.${meId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${meId})`)
    .ilike('content', '✅%accepteret%')
    .order('created_at', { ascending: false })
    .limit(1);
  if (e2) throw e2;
  return tradesFromMessages(msgs)[0] || null;
}
