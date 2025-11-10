import { TripShareClient } from "./trip-share-client";

type TripSharePageProps = {
  params: Promise<{ tripId: string }>;
};

export default async function TripSharePage({ params }: TripSharePageProps) {
  const { tripId } = await params;
  return <TripShareClient tripId={tripId} />;
}
