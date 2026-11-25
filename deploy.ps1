param(
    [string]$Profile = "default",
    [string]$Region = "us-east-1",
    [string]$ModelId = "us.amazon.nova-pro-v1:0"
)

$ErrorActionPreference = "Stop"

# Prefer the updated AWS CLI v2.42+ binary if present
$UpdatedAws = "$env:LOCALAPPDATA\Programs\AWSCLIV2\Amazon\AWSCLIV2\aws.exe"
$AwsBin = if (Test-Path $UpdatedAws) { $UpdatedAws } else { "aws" }

Write-Host "=== FinWise AI Multi-Account Deployment ===" -ForegroundColor Cyan
Write-Host "Target AWS Profile: $Profile | Region: $Region | Bedrock Model: $ModelId"

$env:AWS_PROFILE = $Profile
$env:AWS_REGION = $Region
$env:AWS_DEFAULT_REGION = $Region
$env:BEDROCK_MODEL_ID = $ModelId

if (-not $env:GEMINI_API_KEY -and (Test-Path ".env")) {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^GEMINI_API_KEY=(.+)$") {
            $env:GEMINI_API_KEY = $matches[1].Trim().Trim('"').Trim("'")
        }
    }
}
if ($env:GEMINI_API_KEY) {
    Write-Host "Google Gemini API Key loaded from .env (Active multi-provider GenAI)" -ForegroundColor Green
}

Write-Host "`n[1/5] Verifying AWS Identity..." -ForegroundColor Yellow
$IdentityJson = & $AwsBin sts get-caller-identity --output json
if ($LASTEXITCODE -ne 0) {
    Write-Error "AWS authentication failed for profile '$Profile'. Run: aws login --profile $Profile"
}
$Identity = $IdentityJson | ConvertFrom-Json
$AccountId = $Identity.Account
$env:CDK_DEFAULT_ACCOUNT = $AccountId
$env:CDK_DEFAULT_REGION = $Region
Write-Host "Authenticated Account: $AccountId ($($Identity.Arn))" -ForegroundColor Green

# Export temporary session credentials so Node-based CDK CLI works seamlessly with aws login profiles
$CredsJson = & $AwsBin configure export-credentials --profile $Profile 2>$null
if ($LASTEXITCODE -eq 0 -and $CredsJson) {
    $Creds = $CredsJson | ConvertFrom-Json
    if ($Creds.AccessKeyId -and $Creds.SecretAccessKey) {
        $env:AWS_ACCESS_KEY_ID = $Creds.AccessKeyId
        $env:AWS_SECRET_ACCESS_KEY = $Creds.SecretAccessKey
        if ($Creds.SessionToken) {
            $env:AWS_SESSION_TOKEN = $Creds.SessionToken
        }
    }
}

Write-Host "`n[2/5] Installing & Building Frontend Portal..." -ForegroundColor Yellow
Push-Location frontend
if (-not (Test-Path "node_modules")) { npm install }
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Frontend build failed" }
Pop-Location

Write-Host "`n[3/5] Installing CDK Infrastructure Dependencies..." -ForegroundColor Yellow
Push-Location infra
if (-not (Test-Path "node_modules")) { npm install }
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "CDK TypeScript check failed" }

Write-Host "`n[4/5] Bootstrapping CDK for aws://$AccountId/$Region..." -ForegroundColor Yellow
npx cdk bootstrap "aws://$AccountId/$Region"
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "CDK bootstrap failed" }

Write-Host "`n[5/5] Deploying FinWiseAiStack..." -ForegroundColor Yellow
$StackStatus = & $AwsBin cloudformation describe-stacks --stack-name FinWiseAiStack --region $Region --query "Stacks[0].StackStatus" --output text 2>$null
if ($StackStatus -eq "ROLLBACK_COMPLETE") {
    Write-Host "Cleaning up previous ROLLBACK_COMPLETE stack before fresh deploy..." -ForegroundColor DarkYellow
    & $AwsBin cloudformation delete-stack --stack-name FinWiseAiStack --region $Region
    & $AwsBin cloudformation wait stack-delete-complete --stack-name FinWiseAiStack --region $Region
}
npx cdk deploy --all --require-approval never
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "CDK deploy failed" }
Pop-Location

Write-Host "`nDeployment complete! Check the PortalUrl output above." -ForegroundColor Green
