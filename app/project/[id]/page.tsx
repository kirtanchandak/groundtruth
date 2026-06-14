import DashboardPage from "@/app/dashboard/page";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params;
  return <DashboardPage projectIdFromRoute={id} />;
}
