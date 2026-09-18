import type { FastifyInstance } from "fastify";
import { StudentService } from "../domain/student/service.js";
import { DrizzleStudentRepository, type StudentRepository } from "../domain/student/repository.js";

export interface RegisterStudentOverrides {
  /** Injectable for tests — bypasses the real Postgres connection entirely.
   * Production (app.ts, no override) always uses DrizzleStudentRepository. */
  studentRepository?: StudentRepository;
}

// Same loose generic slots as plugins/leave.ts, same reason (Fastify+pino
// generic-typing friction on a plain function call vs. app.register()).
export function registerStudent(
  app: FastifyInstance<any, any, any, any, any>, // eslint-disable-line @typescript-eslint/no-explicit-any -- see plugins/leave.ts
  overrides: RegisterStudentOverrides = {},
): void {
  const repository = overrides.studentRepository ?? new DrizzleStudentRepository();
  app.decorate("studentService", new StudentService(repository));
}
