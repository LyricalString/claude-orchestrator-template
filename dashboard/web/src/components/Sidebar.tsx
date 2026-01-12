import type { Project } from "../types";

interface SidebarProps {
  projects: Project[];
  selectedProjectId: number | null;
  onSelectProject: (projectId: number | null) => void;
}

export function Sidebar({ projects, selectedProjectId, onSelectProject }: SidebarProps) {
  const totalActive = projects.reduce((sum, p) => sum + p.activeAgents, 0);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">Projects</div>
      <div className="project-list">
        <div
          className={`project-item all ${selectedProjectId === null ? "active" : ""}`}
          onClick={() => onSelectProject(null)}
        >
          <span className="name">All Projects</span>
          {totalActive > 0 && <span className="count">{totalActive}</span>}
        </div>

        {projects.map((project) => (
          <div
            key={project.id}
            className={`project-item ${selectedProjectId === project.id ? "active" : ""}`}
            onClick={() => onSelectProject(project.id)}
          >
            <span
              className={`indicator ${project.activeAgents > 0 ? "active" : ""}`}
            />
            <span className="name" title={project.path}>
              {project.name}
            </span>
            {project.activeAgents > 0 && (
              <span className="count">{project.activeAgents}</span>
            )}
          </div>
        ))}

        {projects.length === 0 && (
          <div className="empty-state" style={{ padding: "20px 12px" }}>
            <p>No projects yet</p>
          </div>
        )}
      </div>
    </aside>
  );
}
