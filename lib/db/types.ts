import type { Database } from "@/lib/database.types";

export type { Database };

export type Tables = Database["public"]["Tables"];

export type Project = Tables["projects"]["Row"];
export type ProjectInsert = Tables["projects"]["Insert"];

export type Flow = Tables["flows"]["Row"];
export type FlowInsert = Tables["flows"]["Insert"];

export type Step = Tables["steps"]["Row"];
export type StepInsert = Tables["steps"]["Insert"];

export type StepBlock = Tables["step_blocks"]["Row"];
export type StepBlockInsert = Tables["step_blocks"]["Insert"];

export type Comment = Tables["comments"]["Row"];
export type CommentInsert = Tables["comments"]["Insert"];

export type StepStatus = Step["status"];
