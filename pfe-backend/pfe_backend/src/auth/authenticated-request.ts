import type { Request } from 'express';

export interface AuthenticatedUserPayload {
  id: number | string;
  email?: string;
  role: string;
}

export type AuthenticatedRequest = Request & {
  decodedData: AuthenticatedUserPayload;
};

export function requesterFrom(req: AuthenticatedRequest): {
  id: number;
  role: string;
} {
  return {
    id: Number(req.decodedData.id),
    role: req.decodedData.role,
  };
}
