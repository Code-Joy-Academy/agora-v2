import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { resolvePrincipal } from '../auth/session.js';
import { pool } from '../db/pool.js';
import { config } from '../config/env.js';
import type { WsEvent } from '../types.js';

interface Conn {
  ws: WebSocket;
  room: string;
  role: 'Teacher' | 'Student';
  user_id: string;
  course_id: string;
}
const conns = new Set<Conn>();
export const roomFor = (course_id: string) => `course:${course_id}:events`;

function cookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split(';')) {
    const [key, ...value] = pair.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

export function initWsHub(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
  wss.on('connection', (ws, req) => {
    void (async () => {
      try {
        const origin = req.headers.origin;
        const allowedOrigins = config.corsOrigins.split(',').map((value) => value.trim()).filter(Boolean);
        if (!origin || !allowedOrigins.includes(origin)) {
          ws.close(1008, 'Origin not allowed');
          return;
        }
        const url = new URL(req.url ?? '', 'http://localhost');
        const course_id = url.searchParams.get('course_id') ?? '';
        const principal = await resolvePrincipal(cookieValue(req.headers.cookie, 'agora_session'));
        if (!principal || !principal.courses.includes(course_id)) {
          ws.close(1008, 'Authentication or course membership required');
          return;
        }
        if (ws.readyState !== WebSocket.OPEN) return;
        const conn: Conn = {
          ws, room: roomFor(course_id), role: principal.courseRoles[course_id],
          user_id: principal.userId, course_id,
        };
        conns.add(conn);
        ws.on('message', (raw) => {
          void (async () => {
            try {
              const msg = JSON.parse(raw.toString());
              if (msg.type === 'teacher_override' && conn.role === 'Teacher') {
                const targetStudent = String(msg.student_id ?? '');
                const { rows } = await pool.query(
                    `SELECT 1 FROM course_memberships cm JOIN users u ON u.id=cm.user_id
                    WHERE cm.course_id=$1 AND cm.user_id=$2 AND u.role='Student'`,
                    [conn.course_id, targetStudent],
                );
                if (!rows[0]) return;
                broadcastToStudent(conn.room, targetStudent, {
                  type: 'teacher_override', course_id: conn.course_id,
                  node_id: msg.node_id ?? null, student_id: targetStudent,
                  payload: { message: String(msg.message ?? '').slice(0, 2000) },
                });
              }
            } catch { /* ignore malformed or unauthorized frames */ }
          })();
        });
        ws.on('close', () => conns.delete(conn));
      } catch {
        ws.close(1011, 'Unable to authenticate connection');
      }
    })();
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
    if (c.room === room && c.user_id === student_id && c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(event));
  }
}
