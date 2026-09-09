import { ProjectTabs } from "@/components/ProjectTabs";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[id]">) {
  const { id } = await params;

  return (
    <div className="flex flex-col">
      <div className="border-b border-border bg-surface px-6 sm:px-8 lg:px-12 xl:px-16">
        <ProjectTabs projectId={id} />
      </div>
      {children}
    </div>
  );
}
