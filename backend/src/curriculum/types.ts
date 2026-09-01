export interface CurriculumNodeSeed {
  id: string;
  strand: string;
  title: string;
  description: string;
  sample_passage: string | null;
  order_index: number;
  question: string;
  misconception_triggers: string[];
}

export interface CurriculumPack {
  pack_id: string;
  subject: string;
  stage_label: string;
  strands: Record<string, string>; // strand key -> display label
  nodes: CurriculumNodeSeed[];
}
