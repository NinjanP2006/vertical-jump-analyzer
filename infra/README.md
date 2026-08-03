# Backend infrastructure (AWS CDK)

Phase-2 backend for accounts and saved jump history. Everything here is **infrastructure-as-code** —
`cdk deploy` provisions the real AWS resources. Video analysis stays in the browser; only the
numeric result of each jump is ever sent here.

## What it provisions

| Resource | Purpose |
|---|---|
| **Cognito** user pool + hosted UI | Sign-up / log-in, issues the JWT |
| **DynamoDB** table (`pk`/`sk`) | Stores one item per jump, keyed by user |
| **Lambda** × 3 | `POST /jumps`, `GET /jumps`, `DELETE /jumps/{jumpId}` |
| **API Gateway** (HTTP API) | Public endpoints, all behind a Cognito JWT authorizer |

## Prerequisites (one-time)

1. An **AWS account**.
2. **AWS CLI** installed and configured with credentials: `aws configure` (needs an IAM user/role
   with permissions to create the resources above).
3. **Bootstrap CDK** in your account/region once: `npx cdk bootstrap`.

## Deploy

```bash
cd infra
npm install
npm run synth      # validates + prints the CloudFormation (no AWS calls, no credentials needed)
npm run deploy     # creates the resources; asks you to approve IAM changes
```

Useful overrides (context flags):

```bash
# Point callbacks/CORS at a deployed frontend instead of localhost:
npm run deploy -- -c appUrl=https://your-app.example.com

# The hosted-UI subdomain must be globally unique; change it if the default is taken:
npm run deploy -- -c domainPrefix=your-unique-prefix
```

## After deploy

`cdk deploy` prints outputs — copy them into the **frontend** `.env` (wired up in the next step):

```
VerticalJumpBackend.Region           -> VITE_AWS_REGION
VerticalJumpBackend.UserPoolId       -> VITE_COGNITO_USER_POOL_ID
VerticalJumpBackend.UserPoolClientId -> VITE_COGNITO_CLIENT_ID
VerticalJumpBackend.HostedUiDomain   -> VITE_COGNITO_DOMAIN
VerticalJumpBackend.ApiUrl           -> VITE_API_URL
```

## Data model

Single-table design:

```
pk = USER#<cognito-sub>     sk = JUMP#<uuid>
attrs: jumpId, heightCm, flightTimeMs, fps, notes, capturedAt, createdAt
```

`GET /jumps` runs one `Query` on `pk` and sorts newest-first in the handler. A user can only ever
read or delete items under their own `pk`, which comes from the verified JWT — not from the request.

## Costs & teardown

On-demand DynamoDB, Lambda, and HTTP API all scale to ~zero at hobby volume; Cognito's free tier is
generous. To remove everything:

```bash
npm run destroy
```

> The DynamoDB table uses `RemovalPolicy.DESTROY` for development — destroying the stack deletes
> stored jumps. Switch to `RETAIN` in `lib/backend-stack.ts` before storing data you care about.
