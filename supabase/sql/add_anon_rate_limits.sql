-- ══════════════════════════════════════════════════════════════════════
--  Rate-limit for ANONYME kald
--  Kør i Supabase Dashboard → SQL Editor → Run. Idempotent, sikker at gentage.
-- ══════════════════════════════════════════════════════════════════════
--
--  HVORFOR EN NY TABEL
--  Den eksisterende `rate_limits` har PRIMARY KEY (user_id, scope), hvor
--  user_id er en uuid med fremmednøgle til auth.users. Den kan derfor kun
--  bruges når kalderen er logget ind.
--
--  Kontaktformularen er med vilje åben: `notify-message` har "Verify JWT"
--  slået fra, så en besøgende kan skrive uden at oprette konto. Men uden en
--  grænse kan hvem som helst kalde endpointet i en løkke og sende ubegrænset
--  mange mails til admin gennem Resend. Tre regninger for det: en fyldt
--  indbakke, betaling pr. mail, og risiko for at Resend lukker kontoen for
--  misbrug.
--
--  Nøglen er derfor en fri tekst (klientens IP), ikke en uuid.
--
--  RLS er slået til UDEN politikker. Det betyder at kun service-role kan
--  læse og skrive — altså edge functions. En almindelig bruger med den
--  offentlige anon-nøgle kan hverken se eller nulstille sin egen tæller.

CREATE TABLE IF NOT EXISTS rate_limits_anon (
  key          text        NOT NULL,   -- fx klientens IP
  scope        text        NOT NULL,   -- fx 'contact_form'
  window_start timestamptz NOT NULL DEFAULT now(),
  count        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (key, scope)
);

ALTER TABLE rate_limits_anon ENABLE ROW LEVEL SECURITY;
-- Ingen politikker med vilje = kun service-role har adgang.

-- Oprydning: rækker ældre end et døgn har ingen værdi. Indekset gør det
-- billigt at slette dem, hvis du senere vil køre en oprydning manuelt eller
-- via en scheduled function.
CREATE INDEX IF NOT EXISTS rate_limits_anon_window_idx
  ON rate_limits_anon (window_start);

-- Manuel oprydning (valgfri, kør når du har lyst):
--   DELETE FROM rate_limits_anon WHERE window_start < now() - interval '1 day';
