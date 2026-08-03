import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE, json, userIdFrom } from './db';

// POST /jumps — persist one measured jump for the signed-in user.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = userIdFrom(event);
  if (!userId) return json(401, { error: 'Unauthorized' });

  let body: Record<string, unknown>;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const heightCm = Number(body.heightCm);
  const flightTimeMs = Number(body.flightTimeMs);
  if (!Number.isFinite(heightCm) || heightCm <= 0 || heightCm > 200) {
    return json(400, { error: 'heightCm must be a positive number below 200' });
  }
  if (!Number.isFinite(flightTimeMs) || flightTimeMs <= 0) {
    return json(400, { error: 'flightTimeMs must be a positive number' });
  }

  const now = new Date().toISOString();
  const jumpId = randomUUID();
  const item = {
    pk: `USER#${userId}`,
    sk: `JUMP#${jumpId}`,
    jumpId,
    heightCm,
    flightTimeMs,
    fps: Number.isFinite(Number(body.fps)) ? Number(body.fps) : null,
    notes: typeof body.notes === 'string' ? body.notes.slice(0, 500) : null,
    capturedAt: typeof body.capturedAt === 'string' ? body.capturedAt : now,
    createdAt: now,
  };

  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
  return json(201, { jump: item });
};
