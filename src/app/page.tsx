import LandingPage from './LandingPage';
import { getLandingImages, getFeatureVideo } from '@/lib/pexels';

export default async function Page() {
  const [images, featureVideo] = await Promise.all([getLandingImages(), getFeatureVideo()]);
  return <LandingPage images={images} featureVideo={featureVideo} />;
}
