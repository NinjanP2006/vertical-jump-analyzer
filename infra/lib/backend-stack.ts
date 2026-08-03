import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';

export interface BackendStackProps extends cdk.StackProps {
  /** Frontend origin — used for hosted-UI callbacks and API CORS. */
  appUrl: string;
  /** Globally-unique Cognito hosted-UI subdomain prefix. */
  domainPrefix: string;
}

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    // --- Data: single-table design ---------------------------------------------------------
    // pk = USER#<sub>, sk = JUMP#<jumpId>. One query (pk = USER#id) returns a user's jumps;
    // they're sorted newest-first in the list handler. On-demand billing scales to ~zero cost.
    const table = new dynamodb.Table(this, 'JumpsTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      // DEV default — swap to RETAIN before storing real user data you can't lose.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // --- Auth: Cognito user pool + hosted UI -----------------------------------------------
    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: false } },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient('WebClient', {
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [props.appUrl, `${props.appUrl}/`],
        logoutUrls: [props.appUrl, `${props.appUrl}/`],
      },
      preventUserExistenceErrors: true,
    });

    const domain = userPool.addDomain('HostedUiDomain', {
      cognitoDomain: { domainPrefix: props.domainPrefix },
    });

    // --- Compute: one Lambda per route (least privilege) -----------------------------------
    const fn = (name: string, entry: string) =>
      new NodejsFunction(this, name, {
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: path.join(__dirname, `../lambda/${entry}`),
        environment: { TABLE_NAME: table.tableName },
        bundling: { minify: true, target: 'node22' },
        timeout: cdk.Duration.seconds(10),
      });

    const createFn = fn('CreateJumpFn', 'createJump.ts');
    const listFn = fn('ListJumpsFn', 'listJumps.ts');
    const deleteFn = fn('DeleteJumpFn', 'deleteJump.ts');

    table.grantWriteData(createFn);
    table.grantReadData(listFn);
    table.grantWriteData(deleteFn); // grantWriteData includes DeleteItem

    // --- API: HTTP API, all routes behind a Cognito JWT authorizer -------------------------
    const authorizer = new HttpUserPoolAuthorizer('JwtAuthorizer', userPool, {
      userPoolClients: [userPoolClient],
    });

    const httpApi = new apigw.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: [props.appUrl],
        allowMethods: [
          apigw.CorsHttpMethod.GET,
          apigw.CorsHttpMethod.POST,
          apigw.CorsHttpMethod.DELETE,
          apigw.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['authorization', 'content-type'],
      },
    });

    httpApi.addRoutes({
      path: '/jumps',
      methods: [apigw.HttpMethod.POST],
      integration: new HttpLambdaIntegration('CreateInt', createFn),
      authorizer,
    });
    httpApi.addRoutes({
      path: '/jumps',
      methods: [apigw.HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListInt', listFn),
      authorizer,
    });
    httpApi.addRoutes({
      path: '/jumps/{jumpId}',
      methods: [apigw.HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('DeleteInt', deleteFn),
      authorizer,
    });

    // --- Outputs: paste these into the frontend .env (step 2) ------------------------------
    new cdk.CfnOutput(this, 'Region', { value: this.region });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'HostedUiDomain', { value: domain.baseUrl() });
    new cdk.CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
  }
}
