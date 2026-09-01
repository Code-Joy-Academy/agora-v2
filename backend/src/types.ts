export type Role = 'Teacher' | 'Student';
export type Mode = 'socratic' | 'exploratory';
export type MasteryLabel = 'New' | 'Exploring' | 'Familiar' | 'Mastered';

export interface CurriculumNode {
  id: string;
  pack_id: string;
  strand: string;
  title: string;
  description: string;
  sample_passage: string | null;
  order_index: number;
}

export interface MasteryState {
  student_id: string;
  node_id: string;
  course_id: string;
  p_mastery: number;
  correct_count: number;
  incorrect_count: number;
  hint_count: 0 | 1 | 2 | 3;
  consecutive_successes: number;
  time_on_task_seconds: number;
  last_misconception: string | null;
}

export interface TurnEvaluation {
  is_correct: boolean;
  matched_misconception: string | null;
  feedback_signal: string;
}

export interface ScaffoldResponse {
  scaffold_level: 0 | 1 | 2 | 3 | 4;
  message: string;
}

export interface WsEvent {
  type: 'friction_alert' | 'state_update' | 'teacher_override';
  course_id: string;
  node_id: string | null;
  student_id: string;
  session_id?: string;
  payload: unknown;
}

export function masteryLabel(p: number): MasteryLabel {
  if (p >= 0.8) return 'Mastered';
  if (p >= 0.5) return 'Familiar';
  if (p >= 0.25) return 'Exploring';
  return 'New';
}
