import { getProject } from "@/lib/project-store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/projects/[id]">) {
  const { id } = await context.params;
  const project = await getProject(id);

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  return Response.json(project);
}
