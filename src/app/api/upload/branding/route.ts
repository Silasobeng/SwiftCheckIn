import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_KINDS = new Set(['logo', 'cover']);
const DEFAULT_BUCKET = process.env.SUPABASE_BRANDING_BUCKET || 'branding-assets';

function extensionFor(file: File): string {
  const extFromName = file.name.split('.').pop()?.toLowerCase();
  if (extFromName && /^[a-z0-9]+$/.test(extFromName)) return extFromName;
  const mime = file.type.toLowerCase();
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'bin';
}

async function ensureBucketExists() {
  const supabase = getServerSupabase();
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`Could not list storage buckets: ${error.message}`);

  const exists = buckets?.some((bucket) => bucket.name === DEFAULT_BUCKET);
  if (exists) return;

  const { error: createError } = await supabase.storage.createBucket(DEFAULT_BUCKET, {
    public: true,
    fileSizeLimit: `${MAX_FILE_SIZE}`,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  });

  if (createError && !/already exists/i.test(createError.message)) {
    throw new Error(`Could not create branding bucket: ${createError.message}`);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const kind = String(formData.get('kind') || 'logo');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No image file was provided.' }, { status: 400 });
    }

    if (!ALLOWED_KINDS.has(kind)) {
      return NextResponse.json({ error: 'Invalid upload type.' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image uploads are allowed.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Image is too large. Maximum size is 5MB.' }, { status: 400 });
    }

    await ensureBucketExists();

    const bytes = Buffer.from(await file.arrayBuffer());
    const extension = extensionFor(file);
    const safeSlug = auth.session.orgSlug.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'church';
    const filename = `${kind}-${Date.now()}.${extension}`;
    const path = `${safeSlug}/${kind}/${filename}`;

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
    const url = publicUrlData.publicUrl;

    return NextResponse.json({ success: true, url, path, bucket: DEFAULT_BUCKET });
  } catch (error) {
    console.error('Branding upload error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500 });
  }
}
