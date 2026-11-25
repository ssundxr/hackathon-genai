# FinWise AI — Personal Financial Literacy & Budgeting Portal (PS 31)

**FinWise AI** is an AWS serverless GenAI financial assistant that combines **deterministic financial analytics**, **dual-input ingestion (Bank Statement CSV + One-Time Excel Mapping + Designated Portal Ledger)**, **longitudinal multi-month memory in DynamoDB**, and **personalized coaching via Amazon Bedrock**.

## Architecture

- **Frontend Portal:** React + TypeScript + Vite + Recharts + SheetJS (`xlsx`) hosted on **Amazon S3** and delivered globally via **Amazon CloudFront** (OAC).
- **Backend API:** **API Gateway HTTP API** + **AWS Lambda (Python 3.13)** routed under `/api/*` on the same CloudFront origin (zero CORS issues).
- **Financial Analytics Engine:** Deterministic Python calculations for Financial Health Score (0–100), 50/30/20 benchmarks, subscription & anomaly alerts, Debt Avalanche vs. Snowball simulation, 5-year compound wealth projections, and Month-over-Month (MoM) deltas.
- **GenAI Coach & Literacy Engine:** **Amazon Bedrock (`bedrock-runtime` Converse API)** using Amazon Nova Pro (with automatic fallback to Nova Lite) grounded in verified analytics and multi-month historical memory.
- **Persistence:** **Amazon DynamoDB** single-table design (`PAY_PER_REQUEST`) storing user profiles, saved Excel column mappings, unified ledger entries, monthly snapshots, and chat memory, plus **Amazon S3** raw statement archival.

## Local Development

```powershell
# 1. Run backend unit tests
backend\.venv\Scripts\python.exe -m pytest backend\tests\test_finwise.py -v

# 2. Start local backend API (http://127.0.0.1:8000)
backend\.venv\Scripts\python.exe backend\local_server.py

# 3. Start frontend portal (http://localhost:5173)
cd frontend
npm install
npm run dev
```

## Deploy to AWS
See [DEPLOY.md](./DEPLOY.md) or run:
```powershell
.\deploy.ps1 -Profile default -Region us-east-1
```
