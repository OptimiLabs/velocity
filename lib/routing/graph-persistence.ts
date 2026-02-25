/**
 * Thin re-exports from the DB module for backward compatibility.
 * All graph persistence now goes through lib/db/routing-graph.ts.
 */
export {
  readFullGraph,
  readFullGraph as readGraphFromDisk,
  readScopedGraph,
  addManualEdge,
  removeManualEdge,
  updateNodePosition,
} from "@/lib/db/routing-graph";
