import { createProject, listProjects } from "@/lib/project-store";
import { CreateProjectRequestSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(await listProjects());
}

export async function POST(request: Request) {
  try {
    const body = CreateProjectRequestSchema.parse(await request.json());
    return Response.json(await createProject(body));
  } catch (error) {
    console.error("GroundTruth project create failed.", error);
    return Response.json(
      {
        error: "Invalid project upload",
        detail: "Upload at least one CSV row with a company_name value.",
      },
      { status: 400 },
    );
  }
}
