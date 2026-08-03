export const upsertProject = (projects, project) => {
  const index = projects.findIndex((item) => item.id === project.id);
  if (index === -1) return [...projects, project];

  const nextProjects = [...projects];
  nextProjects[index] = { ...projects[index], ...project };
  return nextProjects;
};
