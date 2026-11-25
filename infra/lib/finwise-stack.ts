import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export class FinWiseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. DynamoDB Single-Table Store (Profiles, Saved Excel Maps, Ledger, Monthly Snapshots, Chat History)
    const table = new dynamodb.Table(this, 'FinWiseWorkspaceTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    // 2. Private S3 Archive Bucket for raw uploaded statements
    const archiveBucket = new s3.Bucket(this, 'FinWiseArchiveBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // 3. Private S3 Bucket for the React Portal static build assets
    const siteBucket = new s3.Bucket(this, 'FinWisePortalBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // 4. Python 3.13 Lambda API Backend (Zero-Docker, pure Python + built-in boto3)
    const bedrockModelId =
      this.node.tryGetContext('bedrockModelId') ||
      process.env.BEDROCK_MODEL_ID ||
      'us.amazon.nova-pro-v1:0';

    const geminiApiKey =
      this.node.tryGetContext('geminiApiKey') ||
      process.env.GEMINI_API_KEY ||
      '';

    const apiLambda = new lambda.Function(this, 'FinWiseApiLambda', {
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'app.handler.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend'), {
        exclude: [
          '.venv',
          '.venv/**',
          '.pytest_cache',
          '.pytest_cache/**',
          'tests',
          'tests/**',
          '**/__pycache__',
          '**/*.pyc',
          'local_server.py',
          'requirements.txt',
        ],
      }),
      timeout: Duration.seconds(45),
      memorySize: 512,
      description: 'FinWise AI analytics, dual ingestion, DynamoDB memory, portal delivery, and Bedrock/Gemini advisor API',
      environment: {
        TABLE_NAME: table.tableName,
        ARCHIVE_BUCKET: archiveBucket.bucketName,
        PORTAL_BUCKET: siteBucket.bucketName,
        BEDROCK_MODEL_ID: bedrockModelId,
        GEMINI_API_KEY: geminiApiKey,
      },
    });

    table.grantReadWriteData(apiLambda);
    archiveBucket.grantReadWrite(apiLambda);
    siteBucket.grantRead(apiLambda);

    // Scoped least-privilege Bedrock invocation permissions (supports cross-region inference profiles and base models)
    apiLambda.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'InvokeBedrockModels',
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [
          `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
          'arn:aws:bedrock:*::foundation-model/amazon.nova-*',
          'arn:aws:bedrock:*::foundation-model/anthropic.claude-*',
        ],
      })
    );

    // 5. API Gateway HTTP API serving both Portal SPA (/*) and API (/api/*) over single HTTPS domain
    const lambdaIntegration = new HttpLambdaIntegration('FinWiseLambdaIntegration', apiLambda);
    const httpApi = new apigwv2.HttpApi(this, 'FinWiseHttpApi', {
      apiName: 'FinWise-AI-Portal-API',
      description: 'HTTPS front door for FinWise AI Web Portal and API',
      defaultIntegration: lambdaIntegration,
      corsPreflight: {
        allowHeaders: ['Content-Type', 'Authorization'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ['*'],
      },
    });

    // 6. Deploy Frontend Static Build to S3
    new s3deploy.BucketDeployment(this, 'DeployPortalAssets', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../frontend/dist'))],
      destinationBucket: siteBucket,
    });

    new cdk.CfnOutput(this, 'PortalUrl', {
      value: httpApi.apiEndpoint,
      description: 'Live FinWise AI Web Portal HTTPS URL',
    });
    new cdk.CfnOutput(this, 'TableName', {
      value: table.tableName,
      description: 'DynamoDB Workspace and Historical Memory table name',
    });
    new cdk.CfnOutput(this, 'ArchiveBucketName', {
      value: archiveBucket.bucketName,
      description: 'S3 Raw Statement Archive bucket name',
    });
  }
}
