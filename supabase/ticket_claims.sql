-- Run this in your Supabase project (SQL Editor) to create the table for invite ticket claim state.
-- One row per claim; address is unique (one claim per wallet). By-code usage is derived via count.

create table if not exists public.ticket_claims (
  id uuid primary key default gen_random_uuid(),
  address text not null unique,
  code text not null,
  claimed_at timestamptz not null default now()
);

create index if not exists ticket_claims_code_idx on public.ticket_claims (code);
create index if not exists ticket_claims_address_idx on public.ticket_claims (address);

comment on table public.ticket_claims is 'Dungeon Ticket invite claims: one row per address; code usage = count per code.';
