import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
// Same bucket that serves logos and covers — proven to work.
// Person photos live under a `person-photos/` subfolder.
const BUCKET = process.env.SUPABASE_BRANDING_BUCKET || 'branding-assets';

function inferContentType(file: File): string {
  const t = file.type?.toLowerCase();
  if (t === 'image/jpeg' || t === 'image/png' || t === 'image/webp') return t;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function extensionFor(contentType: string, fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext && /^[a-z0-9]+$/.test(ext)) return ext;
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
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
    const bytes = Buffer.from(await file.arrayBuffer());
    const extension = extensionFor(contentType, file.name);
    const safeSlug = auth.session.orgSlug.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'church';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    const path = `${safeSlug}/person-photos/${filename}`;

    const supabase = getServerSupabase();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, {
        contentType,
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ success: true, url: publicUrlData.publicUrl });
  } catch (error) {
    console.error('Person photo upload error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500 });
  }
}
