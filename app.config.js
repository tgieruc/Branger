// Forks use their own EAS project. Values are public build configuration, not secrets.
module.exports = ({ config }) => {
  const projectId = process.env.EAS_PROJECT_ID;
  return {
    ...config,
    ...(process.env.EAS_OWNER ? { owner: process.env.EAS_OWNER } : {}),
    extra: { ...config.extra, ...(projectId ? { eas: { projectId } } : {}) },
    updates: projectId ? { url: `https://u.expo.dev/${projectId}` } : { enabled: false },
  };
};
