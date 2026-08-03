import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE, json, userIdFrom } from './db';

// GET /jumps — all of the signed-in user's jumps, newest first.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = userIdFrom(event);
  if (!userId) return json(401, { error: 'Unauthorized' });

  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':prefix': 'JUMP#' },
    }),
  );

  // A single user's jump count is small, so sorting in-memory by capture time is fine and
  // avoids needing a time-ordered sort key or a secondary index.
  const jumps = (res.Items ?? []).sort((a, b) =>
    String(b.capturedAt).localeCompare(String(a.capturedAt)),
  );

  return json(200, { jumps });
};
