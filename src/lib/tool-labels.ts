// How each agent tool is described to the user. Shared by the server snapshot and the live service.
export const TOOL_LABELS: Record<string, string> = {
  search_memory: "Searched your memory",
  propose_plan: "Drafted a plan",
  propose_memory: "Proposed a memory",
  web_search: "Searched the web",
  fetch_url: "Read a web page",
};

export const toolLabel = (name: string) => TOOL_LABELS[name] ?? name.replace(/_/g, " ");
