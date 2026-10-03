import type { ChatMessage as ApiMessage } from "@/lib/api";

export type Role = 'user' | 'assistant';

export type Source = {
  id: string;
  title: string;
  page: number;
  pageEnd?: number | null; // D-50: khoảng trang (vd. 4–6)
  content: string;
  url?: string;
  citationId?: string;
  documentId: string;
  versionId: string;
};

export type Message = {
  id: string;
  role: Role;
  content: string;
  agentName?: string;
  sources?: Source[];
  meta?: ApiMessage["metadata"]; // thẻ học: quiz, lộ trình, flashcard… (learning-cards)
};
