// Documented Forge module deep-link URL builders (relative to the site base URL).
// Verified shapes (developer.atlassian.com). NOTE: jira:issuePanel & macro are NOT
// deep-linkable — the CDN strips URL params — so they return null; reach them via
// forge/host.ts by driving the host object's UI.

export type JiraProjectType = "software" | "servicedesk" | "core";

/** The deep-link path uses the bare app UUID, NOT the full ARI. */
export function ariToUuid(appIdOrAri: string): string {
  const m = appIdOrAri.match(/app\/([0-9a-fA-F-]{36})/);
  return m ? m[1] : appIdOrAri;
}

const trimEnd = (s: string) => s.replace(/\/+$/, "");

export const deeplink = {
  jiraGlobalPage: (app: string, env: string): string => `/jira/apps/${ariToUuid(app)}/${env}`,

  jiraProjectPage: (type: JiraProjectType, projectKey: string, app: string, env: string): string =>
    `/jira/${type}/projects/${projectKey}/apps/${ariToUuid(app)}/${env}`,

  jiraFullPage: (app: string, env: string, routePrefix: string, route = ""): string =>
    trimEnd(`/forge-apps/a/${ariToUuid(app)}/e/${env}/r/${routePrefix}/${route}`),

  confluenceGlobalPage: (app: string, env: string, route = ""): string =>
    trimEnd(`/wiki/apps/${ariToUuid(app)}/${env}/${route}`),

  confluenceSpacePage: (spaceKey: string, app: string, env: string, route = ""): string =>
    trimEnd(`/wiki/spaces/${spaceKey}/apps/${ariToUuid(app)}/${env}/${route}`),

  /** Not deep-linkable. */
  jiraIssuePanel: (): null => null,
  confluenceMacro: (): null => null,
};
