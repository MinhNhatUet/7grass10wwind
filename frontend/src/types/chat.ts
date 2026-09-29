export type Role = 'user' | 'assistant';

export type Source = {
  id: string;
  title: string;
  page: number;
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
};
