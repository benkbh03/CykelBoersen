-- ════════════════════════════════════════════════════════════════════════
-- add_backup_reader.sql — et login der KUN kan læse, til den natlige backup
-- ════════════════════════════════════════════════════════════════════════
-- Backup-jobbet (privat repo cykelboersen-backup, GitHub Actions) logger ind
-- med denne rolle og kører pg_dump. Rollen kan læse alt, men ikke ændre
-- eller slette noget: den har ingen skrive-rettigheder, og hver forbindelse
-- er read-only. Lækker adgangskoden, kan ingen skade databasen med den.
--
-- FØR DU KØRER: erstat SKRIV_ADGANGSKODE_HER (to steder nedenfor) med en
-- lang tilfældig adgangskode fra din password-manager (mindst 32 tegn, kun
-- bogstaver og tal, så den ikke skal escapes i forbindelses-strengen).
-- Samme adgangskode skal i GitHub-secret'en BACKUP_DB_URL.
--
-- Idempotent: kan køres igen. Kører du den igen med en ny adgangskode,
-- skiftes adgangskoden.
--
-- Fortryd:  DROP OWNED BY backup_reader; DROP ROLE backup_reader;
-- ════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_reader') THEN
    CREATE ROLE backup_reader LOGIN BYPASSRLS CONNECTION LIMIT 2
      PASSWORD 'SKRIV_ADGANGSKODE_HER';
  ELSE
    ALTER ROLE backup_reader LOGIN BYPASSRLS CONNECTION LIMIT 2
      PASSWORD 'SKRIV_ADGANGSKODE_HER';
  END IF;
END $$;

-- Læseadgang til alle tabeller. BYPASSRLS ovenfor er nødvendig, fordi
-- pg_dump ellers afviser tabeller med row level security.
GRANT pg_read_all_data TO backup_reader;

-- Hver forbindelse er read-only, selv hvis rollen senere fik en skrive-
-- rettighed ved en fejl.
ALTER ROLE backup_reader SET default_transaction_read_only = on;

-- Kvittering: skal vise én række med bypassrls = true og read_only-linjen.
SELECT rolname, rolcanlogin, rolbypassrls, rolconnlimit, rolconfig
  FROM pg_roles WHERE rolname = 'backup_reader';
