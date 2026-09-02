import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
// Its own bucket, separate from branding assets — a photo of a real person
// is more sensitive than a church logo, and keeping it in its own bucket
// means a future "delete this person's photo" request (or a bulk cleanup)
// never has to touch or risk anything branding-related.
const DEFAULT_BUCKET = process.env.SUPABASE_PERSON_PHOTOS_BUCKET || 'person-photos';

function extensionFor(file: File): string {
  const extFromName = file.name.split('.').pop()?.toLowerCase();
  if (extFromName && /^[a-z0-9]+$/.test(extFromName)) return extFromName;
  const mime = file.type.toLowerCase();
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return 'bin';
}

async function ensureBucketExists() {
  const supabase = getServerSupabase();
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`Could not list storage buckets: ${error.message}`);

  const exists = buckets?.some((bucket) => bucket.name === DEFAULT_BUCKET);
  if (exists) {
    // The bucket may have been created by an earlier release with a smaller
    // limit. Keep its configuration in step with the application.
    const { error: updateError } = await supabase.storage.updateBucket(DEFAULT_BUCKET, {
      public: true,
      fileSizeLimit: `${MAX_FILE_SIZE}`,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    });
    if (updateError) throw new Error(`Could not update person-photos bucket: ${updateError.message}`);
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(DEFAULT_BUCKET, {
    public: true,
    fileSizeLimit: `${MAX_FILE_SIZE}`,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });

  if (createError && !/already exists/i.test(createError.message)) {
    throw new Error(`Could not create person-photos bucket: ${createError.message}`);
  }
}

// POST — admin-only (kiosk never calls this). Uploads one member/visitor
// photo and returns its public URL; the caller is responsible for saving
// that URL onto the person's record via PATCH /api/people.
export async function POST(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No image file was provided.' }, { status: 400 });
    }
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Please upload a JPG, PNG, or WebP image.' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Image is too large. Maximum size is 10MB.' }, { status: 400 });
    }

    await ensureBucketExists();

    const bytes = Buffer.from(await file.arrayBuffer());
    const extension = extensionFor(file);
    const safeSlug = auth.session.orgSlug.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'church';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    const path = `${safeSlug}/${filename}`;

    const supabase = getServerSupabase();
    const { error: uploadError } = await supabase.storage
      .from(DEFAULT_BUCKET)
      .upload(path, bytes, {
        contentType: file.type,
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage.from(DEFAULT_BUCKET).getPublicUrl(path);
    return NextResponse.json({ success: true, url: publicUrlData.publicUrl });
  } catch (error) {
    console.error('Person photo upload error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500 });
  }
}
