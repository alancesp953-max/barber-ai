-- Bucket público para fotos de perfil dos barbeiros
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'barber-photos',
  'barber-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "barber_photos_public_read" ON storage.objects;
CREATE POLICY "barber_photos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'barber-photos');

DROP POLICY IF EXISTS "barber_photos_auth_upload" ON storage.objects;
CREATE POLICY "barber_photos_auth_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'barber-photos');

DROP POLICY IF EXISTS "barber_photos_auth_update" ON storage.objects;
CREATE POLICY "barber_photos_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'barber-photos')
  WITH CHECK (bucket_id = 'barber-photos');

DROP POLICY IF EXISTS "barber_photos_auth_delete" ON storage.objects;
CREATE POLICY "barber_photos_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'barber-photos');
