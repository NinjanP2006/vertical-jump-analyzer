import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE, json, userIdFrom } from './db';

// DELETE /jumps/{jumpId} — remove one of the signed-in user's jumps. The pk scoping means a
// user can only ever delete their own item, even though jumpId alone is in the path.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = userIdFrom(event);
  if (!userId) return json(401, { error: 'Unauthorized' });

  const jumpId = event.pathParameters?.jumpId;
  if (!jumpId) return json(400, { error: 'Missing jumpId' });

  await ddb.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { pk: `USER#${userId}`, sk: `JUMP#${jumpId}` },
    }),
  );

  return { statusCode: 204 };
};
