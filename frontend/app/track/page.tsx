import { cookies } from "next/headers";
import PageFrame from "../components/PageFrame";
import TrackingView from "../(pages)/track/TrackingView";

export default async function TrackingRoute(){
  const session = (await cookies()).get("lms_session")?.value;
  if (!session) return <TrackingView/>;
  return <PageFrame><TrackingView/></PageFrame>;
}
