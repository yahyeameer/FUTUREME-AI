// How each agent tool is described to the user. Shared by the server snapshot and the live service.
export const TOOL_LABELS: Record<string, string> = {
  docker_mcp: "Docker MCP tools",
  search_memory: "Searched your memory",
  save_file: "Saved a file",
  read_file: "Read a file",
  list_files: "Looked through your files",
  propose_plan: "Drafted a plan",
  propose_memory: "Proposed a memory",
  web_search: "Searched the web",
  fetch_url: "Read a web page",
  delegate_task: "Handed off a task",
  spawn_agent: "Created a helper",
  propose_call: "Proposed a call",
  propose_email: "Drafted an email",
  propose_commitment: "Asked you to confirm a promise",
  confirm_task_done: "Marked a promise kept",
  stop_recording: "Stopped recording the call",
};

export const toolLabel = (name: string) =>
  TOOL_LABELS[name] ?? (name.startsWith("docker_") ? `Docker tool: ${name.slice(7).replace(/_/g, " ")}` : name.replace(/_/g, " "));
