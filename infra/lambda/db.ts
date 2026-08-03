import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

export const TABLE = process.env.TABLE_NAME as string;
export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/** Cognito subject (stable user id) from the verified JWT the authorizer attached. */
export function userIdFrom(event: APIGatewayProxyEventV2WithJWTAuthorizer): string | undefined {
  const claims = event.requestContext.authorizer?.jwt?.claims as
    | Record<string, string>
    | undefined;
  return claims?.sub;
}

export function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}
