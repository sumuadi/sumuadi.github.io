-- Policy change: no reserve/繰り上げ winner tier. An invalidated winner (deadline missed or
-- card mismatch) simply ends that slot rather than promoting a reserve.

-- Any pre-existing 'reserve' rows (none expected — this event hasn't opened yet) would violate
-- the new constraint; clear them back to 'none' first so the migration can apply cleanly.
update public.entries set winner_status = 'none' where winner_status = 'reserve';

-- Drop whatever the winner_status check constraint happens to be named (Postgres auto-names
-- it, and it may not match the name we'd guess) and recreate it without 'reserve'.
do $$
declare
  rec record;
begin
  for rec in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'entries'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%winner_status%'
  loop
    execute format('alter table public.entries drop constraint %I', rec.conname);
  end loop;
end $$;

alter table public.entries
  add constraint entries_winner_status_check
  check (winner_status in ('none', 'winner', 'verified', 'invalidated'));
