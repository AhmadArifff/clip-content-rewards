import type { Response } from 'express';
import type { ApiEnvelope, ServiceResult } from '@clip/shared';

export function sendServiceResult<T>(res: Response, result: ServiceResult<T>, successStatus = 200): void {
  if (result.ok) {
    const body: ApiEnvelope<T> = {
      success: true,
      data: result.data,
      error: null,
      ...(result.meta ? { meta: result.meta } : {})
    };
    res.status(successStatus).json(body);
    return;
  }

  const body: ApiEnvelope<null> = {
    success: false,
    data: null,
    error: {
      code: result.code,
      message: result.message,
      ...(result.details ? { details: result.details } : {})
    }
  };
  res.status(result.statusCode).json(body);
}
