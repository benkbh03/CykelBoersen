-- Fix dansk stavning: 'Felgbremser' → 'Fælgbremser'
-- Kør i Supabase Dashboard → SQL Editor → Run.

UPDATE bikes
SET brake_type = 'Fælgbremser'
WHERE brake_type = 'Felgbremser';
