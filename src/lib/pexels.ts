const PEXELS_SEARCH_URL = 'https://api.pexels.com/v1/search';

export type PexelsImage = {
  url: string;
  alt: string;
  photographer: string;
  pexelsUrl: string;
};

async function searchPexels(query: string): Promise<PexelsImage | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `${PEXELS_SEARCH_URL}?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: key }, next: { revalidate: 60 * 60 * 24 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const photo = data?.photos?.[0];
    if (!photo?.src?.large) return null;
    return {
      url: photo.src.large,
      alt: photo.alt || query,
      photographer: photo.photographer,
      pexelsUrl: photo.url,
    };
  } catch {
    return null;
  }
}

export type LandingImageKey =
  | 'congregation'
  | 'bigGathering'
  | 'checkIn'
  | 'visitor'
  | 'attendance'
  | 'followUp'
  | 'giving'
  | 'insights'
  | 'offline'
  | 'featuresBg'
  | 'emailImg'
  | 'smsImg';

const QUERIES: Record<LandingImageKey, string> = {
  congregation: 'african church congregation worship',
  bigGathering: 'large crowd church service auditorium',
  checkIn: 'hand touchscreen tablet',
  visitor: 'welcome handshake greeting',
  attendance: 'clipboard checklist people',
  followUp: 'writing email laptop',
  giving: 'hands giving donation',
  insights: 'data analytics dashboard',
  offline: 'smartphone hand outdoor',
  featuresBg: 'church sanctuary interior soft bokeh light',
  emailImg: 'email message inbox laptop',
  smsImg: 'smartphone text message chat bubble',
};

export type LandingImages = Record<LandingImageKey, PexelsImage | null>;

// Every entry is fetched independently and defaults to null on any failure
// (missing key, rate limit, network error, empty result) so a Pexels outage
// never breaks the landing page — sections just render without a photo.
export async function getLandingImages(): Promise<LandingImages> {
  const entries = await Promise.all(
    (Object.entries(QUERIES) as [LandingImageKey, string][]).map(
      async ([key, query]) => [key, await searchPexels(query)] as const
    )
  );
  return Object.fromEntries(entries) as LandingImages;
}

// ── Video ──────────────────────────────────────────────────────────────────
export type PexelsVideo = { url: string };

export async function getFeatureVideo(): Promise<PexelsVideo | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent('candle flame bokeh soft light')}&per_page=5&orientation=landscape`,
      { headers: { Authorization: key }, next: { revalidate: 60 * 60 * 24 * 7 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const video = data?.videos?.[0];
    if (!video?.video_files) return null;
    const files = video.video_files as { quality: string; width: number; link: string }[];
    const pick = files.find(f => f.quality === 'hd' && f.width <= 1280)
              || files.find(f => f.quality === 'sd')
              || files[0];
    return pick ? { url: pick.link } : null;
  } catch {
    return null;
  }
}
