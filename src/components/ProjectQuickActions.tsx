import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { BoxIcon, ChevronRightIcon, FileTextIcon, FolderIcon, PlayIcon, UploadIcon } from "@/components/icons";

type Action = {
  label: string;
  description: string;
  href: string;
  icon: React.ReactNode;
};

/**
 * The Overview tab's content for a Project that has nothing in it yet — not a
 * summary (that's `ProjectOverviewSummary`, once there's something to
 * summarize, or the Projects list's expandable detail for plain identity),
 * but a launcher for the handful of things someone starting a Project
 * actually comes here to do first.
 */
export function ProjectQuickActions({ projectId }: { projectId: string }) {
  const base = `/projects/${projectId}`;

  const actions: Action[] = [
    {
      label: "Create your first module",
      description: "Organize requirements into modules to structure your tests.",
      href: `${base}/modules`,
      icon: <BoxIcon />,
    },
    {
      label: "Import test structure",
      description: "Import modules, requirements and test cases from a file.",
      href: `${base}/import`,
      icon: <UploadIcon />,
    },
    {
      label: "Upload project files",
      description: "Add documents, specifications and reference materials.",
      href: `${base}/files`,
      icon: <FileTextIcon />,
    },
    {
      label: "Start a test run",
      description: "Create your first test run and begin testing.",
      href: `${base}/runs`,
      icon: <PlayIcon />,
    },
  ];

  return (
    <div className="flex flex-col items-center gap-6 py-10 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl border border-border bg-brand/10 text-brand">
        <FolderIcon className="size-7" />
      </span>

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Get started with your project
        </h1>
        <p className="max-w-xl text-sm text-muted">
          Your project has been created successfully. Start by setting up your test structure,
          adding files, or running your first tests.
        </p>
      </div>

      <div className="grid w-full max-w-4xl gap-3 sm:grid-cols-2">
        {actions.map((action) => (
          <Link key={action.href} href={action.href} className="flex">
            <Card className="flex w-full items-center gap-3 text-left transition-colors hover:border-brand">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand [&>svg]:size-5">
                {action.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{action.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{action.description}</span>
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-muted" />
            </Card>
          </Link>
        ))}
      </div>

      <LinkButton href={`${base}/modules`} size="lg">
        + Create your first module
      </LinkButton>

      <Link href={`${base}/dashboard`} className="text-sm font-medium text-brand hover:underline">
        Explore all project features →
      </Link>
    </div>
  );
}
