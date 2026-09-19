import type { ProjectStatus, TestRunStatus } from "@/generated/prisma/client";

/** A Project is overdue once its end date has passed while it's still DRAFT or ACTIVE. */
export function isProjectOverdue(project: { status: ProjectStatus; endDate: Date | null }) {
  return Boolean(project.endDate) && project.status !== "COMPLETED" && project.endDate! < new Date();
}

/** A Test Run is overdue once its end date has passed while it's still OPEN. */
export function isTestRunOverdue(run: { status: TestRunStatus; endsOn: Date | null }) {
  return Boolean(run.endsOn) && run.status === "OPEN" && run.endsOn! < new Date();
}
