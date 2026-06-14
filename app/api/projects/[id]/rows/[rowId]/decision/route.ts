import { updateRowDecision } from "@/lib/project-store";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/projects/[id]/rows/[rowId]/decision">) {
  const { id, rowId } = await context.params;
  const body = (await request.json()) as { decision?: string };

  if (!body.decision) {
    return Response.json({ error: "Missing decision" }, { status: 400 });
  }

  await updateRowDecision(id, rowId, body.decision);
  return Response.json({ ok: true });
}
