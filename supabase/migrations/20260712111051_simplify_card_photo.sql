-- Policy change: winner card verification simplified to a single photo (handwriting mission
-- and back-of-card photo removed). Both tables are empty pre-launch, so a straight rename/drop
-- is safe.
alter table public.entries rename column card_photo_front to card_photo;
alter table public.entries drop column card_photo_back;
