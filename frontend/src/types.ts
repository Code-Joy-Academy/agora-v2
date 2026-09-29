export type Role = 'Teacher' | 'Student';
export type MasteryLabel = 'New' | 'Exploring' | 'Familiar' | 'Mastered';
export type ScaffoldLevel = 0 | 1 | 2 | 3 | 4;

export interface TurnResponse {
  state: MasteryState;
  scaffold_level: ScaffoldLevel;
  message: string;
}

export interface SessionUser {
  id: string;
  display_name: string;
  role: Role;
  course_id: string;
  class_code: string;
}

export interface KnowledgeNode {
  id: string;
  pack_id: string;
  strand: string;
  title: string;
  description: string;
  sample_passage: string | null;
  order_index: number;
  p_mastery: number;
  mastery_label: MasteryLabel;
}

export interface TurnMessage {
  role: 'student' | 'tutor' | 'teacher_override';
  content: string;
  scaffold_level?: number;
}

export interface HeatmapCell {
  node_id: string;
  title: string;
  strand: string;
  avg_mastery: number;
  student_count: string;
}

export interface LiveState {
  student_id: string;
  node_id: string;
  node_title: string;
  strand: string;
  display_name: string;
  p_mastery: number;
  hint_count: number;
}

export interface FrictionAlert {
  id: string;
  student_id: string;
  student_name:string;
  display_name: string;
  node_title: string;
  reason: string;
  hint_count: number;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  title: string;
  resource_type: string;
  node_id: string | null;
  created_at: string;
}

export interface ScaffoldRules {
  friction_threshold_hints: number;
  mastery_advance_threshold: number;
  pedagogy_directness: number;
}

export interface CurriculumNode {
  id: string;
  pack_id: string;
  strand: string;
  title: string;
  description: string;
  sample_passage: string | null;
  order_index: number;
  p_mastery?: number;
}

export interface MasteryState {
  student_id: string;
  node_id: string;
  course_id: string;
  p_mastery: number;
  correct_count: number;
  incorrect_count: number;
  hint_count: number;
  consecutive_successes: number;
  time_on_task_seconds: number;
  last_misconception: string | null;
}

export interface TurnResponse {
  state: MasteryState;
  scaffold_level: ScaffoldLevel;
  message: string;
}

export interface SessionContext {
  id: string;
  display_name: string;
  role: 'Teacher' | 'Student';
  course_id: string;
  class_code: string;
}

export interface DocumentIngestionResult {
  document_id: string;
  chunk_count: number;
  embedded: boolean;
}
export interface DocumentRow {
  id: string;
  title: string;
  resource_type: string;
  node_id: string | null;
  created_at: string;
}

export interface Course {
  id: string;
  title: string;
  curriculum_pack_id: string;
  scaffold_rules: ScaffoldRules;
}

export interface StartSessionResponse {
  session_id: string;
  node: CurriculumNode;
  question: string;
  question_id: string;
  state: MasteryState;
}
