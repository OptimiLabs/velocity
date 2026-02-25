export function generateInstanceId(agentName: string): string {
  const short = Math.random().toString(36).slice(2, 8);
  return `${agentName}__i${short}`;
}

export function parseInstanceId(instanceId: string): string {
  const sep = instanceId.lastIndexOf("__i");
  return sep === -1 ? instanceId : instanceId.slice(0, sep);
}
