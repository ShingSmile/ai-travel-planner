-- Voice input bucket configuration
insert into storage.buckets (id, name, public)
values ('voice-inputs', 'voice-inputs', true)
on conflict (id) do nothing;

-- Select policy: users can read their own uploads (public bucket still serves via public URL)
drop policy if exists "voice_inputs_read_own" on storage.objects;
create policy "voice_inputs_read_own"
  on storage.objects
  for select
  using (
    bucket_id = 'voice-inputs'
    and (owner = auth.uid() or auth.role() = 'service_role')
  );

-- Insert policy: authenticated users upload into their bucket folder
drop policy if exists "voice_inputs_insert_own" on storage.objects;
create policy "voice_inputs_insert_own"
  on storage.objects
  for insert
  with check (
    bucket_id = 'voice-inputs'
    and (owner = auth.uid() or auth.role() = 'service_role')
  );

-- Update policy: restrict edits to owners (or service role)
drop policy if exists "voice_inputs_update_own" on storage.objects;
create policy "voice_inputs_update_own"
  on storage.objects
  for update
  using (
    bucket_id = 'voice-inputs'
    and (owner = auth.uid() or auth.role() = 'service_role')
  )
  with check (
    bucket_id = 'voice-inputs'
    and (owner = auth.uid() or auth.role() = 'service_role')
  );

-- Delete policy: owners (or service role) may delete their uploads
drop policy if exists "voice_inputs_delete_own" on storage.objects;
create policy "voice_inputs_delete_own"
  on storage.objects
  for delete
  using (
    bucket_id = 'voice-inputs'
    and (owner = auth.uid() or auth.role() = 'service_role')
  );
