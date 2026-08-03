#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { BackendStack } from '../lib/backend-stack';

const app = new cdk.App();

// Where the frontend is served from — used for Cognito hosted-UI callbacks and API CORS.
// Override at deploy time: `cdk deploy -c appUrl=https://your-app.example.com`
const appUrl = app.node.tryGetContext('appUrl') ?? 'http://localhost:5173';

// Cognito hosted-UI subdomain prefix — MUST be globally unique across all AWS accounts.
// Override if the default is taken: `cdk deploy -c domainPrefix=my-unique-prefix`
const domainPrefix = app.node.tryGetContext('domainPrefix') ?? 'vertical-jump-analyzer';

new BackendStack(app, 'VerticalJumpBackend', {
  appUrl,
  domainPrefix,
  // Environment-agnostic: deploys to whatever account/region the AWS CLI is configured for.
  description: 'Vertical Jump Analyzer — accounts (Cognito) and jump history (DynamoDB) backend',
});
