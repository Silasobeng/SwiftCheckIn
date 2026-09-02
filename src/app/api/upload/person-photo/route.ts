import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DEFAULT_BUCKET = process.env.SUPABASE_PERSON_PHOTOS_BUCKET || 'person-photos';

// Camera captures on many mobile browsers report an empty MIME type.
// Infer from the file extension; default to JPEG since that's what
// virtually every phone camera produces.
function inferContentType(file: File): string {
  if (file.type && SUPPORTED_IMAGE_TYPES.has(file.type)) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function extensionFor(contentType: string, fileName: string): string {
  const extFromName = fileName.split('.').pop()?.toLowerCase();
  if (extFromName && /^[a-z0-9]+$/.test(extFromName)) return extFromName;
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
}

async function ensureBucketExists() {
  const supabase = getServerSupabase();
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`Could not list storage buckets: ${error.message}`);

  const exists = buckets?.some((bucket) => bucket.name === DEFAULT_BUCKET);
  if (exists) {
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

export async function POST(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No image file was provided.' }, { status: 400 });
    }
    if (file.type && !file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Please upload an image file.' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Image is too large. Maximum size is 10MB.' }, { status: 400 });
    }

    const contentType = inferContentType(file);

    await ensureBucketExists();

    const bytes = Buffer.from(await file.arrayBuffer());
    const extension = extensionFor(contentType, file.name);
    const safeSlug = auth.session.orgSlug.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'church';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    const path = `${safeSlug}/${filename}`;

    const supabase = getServerSupabase();
    const { error: uploadError } = await supabase.storage
      .from(DEFAULT_BUCKET)
      .upload(path, bytes, {
        contentType,
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
