import LandingPage from './LandingPage';
import { getLandingImages } from '@/lib/pexels';

export default async function Page() {
  const images = await getLandingImages();
  return <LandingPage images={images} />;
}
