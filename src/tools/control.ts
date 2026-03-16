import { TaskDoneSignal, TaskQuarantineSignal } from "../types.js";

export function taskDone(summary: string, filesChanged: string[]): TaskDoneSignal {
  return new TaskDoneSignal(summary, filesChanged);
}

export function taskQuarantine(reason: string, question: string): TaskQuarantineSignal {
  return new TaskQuarantineSignal(reason, question);
}
