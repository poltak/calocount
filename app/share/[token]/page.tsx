import { Dashboard } from "../../page";

export const dynamic = "force-dynamic";

type SharePageProps = {
  params: Promise<{ token: string }>;
};

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;
  return <Dashboard readOnly shareToken={token} />;
}
