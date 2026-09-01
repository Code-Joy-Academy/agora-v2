export type Role = 'Teacher' | 'Student';
export type MasteryLabel = 'New' | 'Exploring' | 'Familiar' | 'Mastered';

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
