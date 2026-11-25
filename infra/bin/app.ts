import * as cdk from 'aws-cdk-lib';
import { FinWiseStack } from '../lib/finwise-stack';

const app = new cdk.App();

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

new FinWiseStack(app, 'FinWiseAiStack', {
  env,
  description: 'FinWise AI - Serverless Personal Financial Literacy and Budgeting Portal on AWS',
});
