#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { BackendStack } from '../lib/backend-stack';

const app = new cdk.App();

// Frontend origins allowed for Cognito hosted-UI callbacks and API CORS. Comma-separated so a
// deployed site and local dev can both work. Override at deploy time, e.g.:
//   cdk deploy -c appUrls=http://localhost:5173,https://your-app.vercel.app
const appUrlsRaw = app.node.tryGetContext('appUrls') ?? 'http://localhost:5173';
const appUrls = String(appUrlsRaw)
  .split(',')
  .map((s) => s.trim().replace(/\/$/, '')) // normalize: no trailing slash
  .filter(Boolean);

// Cognito hosted-UI subdomain prefix — MUST be globally unique across all AWS accounts.
// Override if the default is taken: `cdk deploy -c domainPrefix=my-unique-prefix`
const domainPrefix = app.node.tryGetContext('domainPrefix') ?? 'vertical-jump-analyzer';

new BackendStack(app, 'VerticalJumpBackend', {
  appUrls,
  domainPrefix,
  // Environment-agnostic: deploys to whatever account/region the AWS CLI is configured for.
  description: 'Vertical Jump Analyzer — accounts (Cognito) and jump history (DynamoDB) backend',
});
