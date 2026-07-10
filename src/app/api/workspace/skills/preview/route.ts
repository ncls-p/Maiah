import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  createSkillInstallPreviewToken,
  previewSkillInstall,
} from "@/modules/skills/use-cases";

const previewSchema = z.object({
  workspaceId: z.uuid(),
  installCommand: z.string().trim().min(1).max(700),
});

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = previewSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "tools.configure",
      );
      if (forbidden) return forbidden;

      const skills = await previewSkillInstall(parsed.data.installCommand);
      const preview = createSkillInstallPreviewToken({
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
        installCommand: parsed.data.installCommand,
        skills,
      });
      return NextResponse.json({ skills, ...preview });
    },
    {
      logLabel: "Failed to preview skill",
      expectedError: (error) => {
        if (error instanceof Error) {
          const expectedMessages = [
            "Install command is required",
            "Install command is too long",
            "Install command contains an unterminated quote",
            "Only `npx skills add ...` commands are supported",
            "Use `npx skills add ...` with a space between skills and add",
            "Only `skills add` install commands are supported",
            "Install command must include a skill package",
            "Only GitHub owner/repository skill packages are supported",
            "Choose a specific skill with `--skill <name>` or `owner/repo@skill`",
            "Skill names must be explicit and contain only letters, numbers, dot, dash or underscore",
            "The install command did not produce any skill directory",
            "No Markdown files were found in the installed skill",
          ];
          if (
            expectedMessages.includes(error.message) ||
            error.message.startsWith("Unsupported install option") ||
            error.message.startsWith("Missing skill name")
          ) {
            return NextResponse.json({ error: error.message }, { status: 400 });
          }
        }
        return NextResponse.json(
          { error: "Skill preview failed" },
          { status: 500 },
        );
      },
    },
  );
}
