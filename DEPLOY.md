# Multi-Account Deployment & Emergency Credit Switch Guide

This project is 100% Infrastructure-as-Code (**AWS CDK**), parameterized with zero hardcoded Account IDs or ARNs so you can pivot to a backup AWS account in ~2 minutes if credits are exhausted.

## 1. Deploy to Primary Account
```powershell
# Re-authenticate if your temporary browser session expired
aws login

# Deploy Portal + Backend + DynamoDB + CloudFront
.\deploy.ps1 -Profile default -Region us-east-1
```

## 2. Emergency Switch to Backup AWS Account
If your primary account runs out of credits:

1. **Authenticate the backup account:**
   ```powershell
   aws login --profile backup
   ```
2. **Deploy the exact same stack to the backup account:**
   ```powershell
   .\deploy.ps1 -Profile backup -Region us-east-1
   ```
3. **Optional — Migrate Demo History:**
   - Click **Backup JSON** in the old portal header to download your snapshots, Excel mappings, and ledger.
   - Open the new CloudFront `PortalUrl` and continue seamlessly!

## 3. Clean Up Resources (After Hackathon)
```powershell
cd infra
npx cdk destroy --profile default
```
