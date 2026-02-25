export interface FileDep {
  id: string;
  plan_id: string;
  source_file: string;
  target_file: string;
  dep_type: "import" | "require" | "type_reference";
  symbol_names: string; // JSON array
}
