import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { WsEvent } from '../types.js';

interface Conn {
  ws: WebSocket;
  room: string; // `course:{course_id}:events`
  role: 'Teacher' | 'Student';
  student_id: string | null;
}

const conns = new Set<Conn>();
export const roomFor = (course_id: string) => `course:${course_id}:events`;

export function initWsHub(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    const course_id = url.searchParams.get('course_id') ?? '';
    const role = (url.searchParams.get('role') as 'Teacher' | 'Student') ?? 'Student';
    const student_id = url.searchParams.get('student_id');
    const conn: Conn = { ws, room: roomFor(course_id), role, student_id };
    conns.add(conn);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'teacher_override' && role === 'Teacher') {
          broadcastToStudent(conn.room, msg.student_id, {
            type: 'teacher_override', course_id, node_id: msg.node_id ?? null, student_id: msg.student_id,
            payload: { message: msg.message },
          });
        }
      } catch {
        /* ignore malformed frames */
      }
    });

    ws.on('close', () => conns.delete(conn));
  });
}

export function broadcastToTeachers(course_id: string, event: WsEvent) {
  const room = roomFor(course_id);
  for (const c of conns) {
    if (c.room === room && c.role === 'Teacher' && c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(event));
  }
}

function broadcastToStudent(room: string, student_id: string, event: WsEvent) {
  for (const c of conns) {
    if (c.room === room && c.student_id === student_id && c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(event));
  }
}
