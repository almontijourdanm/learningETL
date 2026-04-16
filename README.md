# learningETL

Election ETL service using Node.js, Express, Sequelize, and PostgreSQL.

## Project Structure

```text
learningETL/
	backend/
		app/
			config/
				config.js
			migrations/
				20260416000100-create-dukcapil.js
				20260416000200-create-dpt.js
				20260416000300-create-voting.js
				20260416000500-make-voting-nik-unique.js
			models/
				dukcapil.js
				dpt.js
				voting.js
				index.js
			routes/
				etl.js
			index.js
		.env.example
		.sequelizerc
		package.json
		server.js
	data/
		raw_pemilu_full_dump.csv
```

## Backend Setup

1. Go to backend folder.

```bash
cd backend
```

2. Install dependencies.

```bash
npm install
```

3. Create environment file from template.

```bash
cp .env.example .env
```

If you are using Windows CMD:

```cmd
copy .env.example .env
```

4. Update database values in .env.

Required variables:

- DB_HOST
- DB_PORT
- DB_NAME
- DB_NAME_TEST
- DB_USER
- DB_PASSWORD

Recommended for isolated local setup (no impact to other projects):

```env
DB_HOST=localhost
DB_PORT=5435
DB_NAME=learning_etl
DB_NAME_TEST=learning_etl_test
DB_USER=postgres
DB_PASSWORD=postgres
```

## Dedicated PostgreSQL On Port 5435

This project includes an isolated PostgreSQL container that runs only for this repo and uses host port 5435.

Start dedicated DB:

```bash
cd backend
npm run db:up
```

Check DB logs:

```bash
npm run db:logs
```

Stop dedicated DB:

```bash
npm run db:down
```

Then run migrations:

```bash
npm run db:migrate
```

## Migration Commands

Run all migrations:

```bash
npm run db:migrate
```

Undo latest migration:

```bash
npm run db:migrate:undo
```

Check migration status:

```bash
npm run db:migrate:status
```

## Run Backend

Start server:

```bash
npm run start
```

Development mode (auto reload):

```bash
npm run dev
```

Default port is 3000 (configurable with PORT in .env).

## API Endpoints

Health check:

- GET /health

ETL voter validation:

- POST /etl/validate-voter

Purpose:

- Returns voters in dpt who have not voted yet (not found in voting table).

Example request body:

```json
{
	"limit": 1000,
	"offset": 0
}
```

Example response shape:

```json
{
	"success": true,
	"total": 12345,
	"limit": 1000,
	"offset": 0,
	"data": []
}
```

ETL import:

- POST /etl/import-voters

Purpose:

- Imports and normalizes data from CSV into `dukcapil`, `dpt`, and `voting` tables.
- Tracks each import execution in `etl_import_runs`.

Example request body:

```json
{
	"batchSize": 500,
	"filePath": "../data/raw_pemilu_full_dump.csv"
}
```

ETL run summary:

- GET /etl/import-runs/summary?limit=10

Purpose:

- Returns recent ETL runs with quality counters and aggregated metrics.
- Helps monitor import quality and rerun behavior.

Fuzzy duplicate candidates:

- GET /etl/duplicate-candidates?importRunId=39&limit=20&offset=0&minScore=0.88

Purpose:

- Returns possible duplicate pairs detected during ETL.
- This is detection only; records are never auto-merged.

Example response shape:

```json
{
	"success": true,
	"importRunId": "36",
	"sourceFile": "D:\\Almonti\\Nominatix\\learningETL\\data\\raw_pemilu_full_dump.csv",
	"batchSize": 500,
	"totalRows": 300000,
	"insertedDukcapil": 300000,
	"insertedDpt": 300000,
	"insertedVoting": 145670,
	"skippedRows": 0,
	"errorRows": 0,
	"status": "success"
}
```

## ETL Learning Purpose

This project is intentionally built as a learning ETL pipeline, not a final production-grade pipeline.

Main learning objectives:

- Design an end-to-end ETL flow (Extract, Transform, Load) with real data volume.
- Separate raw input into domain tables for different use cases.
- Implement batching to handle large CSV files efficiently.
- Add observability by recording run status and import metrics.
- Practice data-quality hardening through iterative improvements.

## ETL Process In This Project

1. Extract

- Source file: `data/raw_pemilu_full_dump.csv`.
- The service reads data using a stream parser to avoid loading all rows in memory.

2. Transform

- Normalize column names and string values (trim/cleanup).
- Standardize NIK and parse date/date-time fields.
- Build three entities from one source row:
- `dukcapil`: identity-focused record.
- `dpt`: election list-focused record.
- `voting`: vote event when row is valid for voting facts.

3. Load

- Process rows in batches (default 500, max 1000).
- Upsert by `nik` into `dukcapil` and `dpt` (rerun-safe for those tables).
- Insert voting events into `voting` with conflict-safe behavior (`ON CONFLICT (nik) DO NOTHING`).

4. Track and Report

- Every import run is written to `etl_import_runs` with `running` or `success`/`failed` status.
- Metrics include total rows, inserted counts, skipped rows, and errors.
- Additional counters include:
- `updated_dukcapil`, `updated_dpt`, `affected_dukcapil`, `affected_dpt`
- `rows_without_nik`, `hadir_false_rows`, `invalid_flag_true_rows`, `invalid_voted_at_rows`
- `voting_eligible_rows`, `voting_ineligible_rows`
- `duplicate_candidates`

## Fuzzy Candidate Phase

This project now supports phase-1 fuzzy candidate detection:

- Detect likely duplicate identities using canonicalized name/address plus matching `tanggal_lahir`.
- Store candidate pairs with `similarity_score` and `match_reason` in `etl_duplicate_candidates`.
- Keep `review_status` as `pending` by default.
- No automatic merge is performed.

5. Validate Business Output

- `POST /etl/validate-voter` returns voters in `dpt` who are not present in `voting`.

## Why Data Can Still Be "Not Good" Right Now

This is expected in a learning ETL phase.

Current known gaps:

- Existing legacy data may still contain duplicates until migration is applied.
- Source values can be noisy or inconsistent, so transformations are still basic.
- There is no reject/quarantine table yet for problematic rows.

This is exactly where ETL learning happens: run pipeline, inspect outcomes, then tighten quality rules.

## Suggested Next Improvements

1. Make `voting` idempotent on reruns:

- Done in this repo:
- Add unique index on `voting.nik` via migration `20260416000500-make-voting-nik-unique.js`.
- Use `ON CONFLICT (nik) DO NOTHING` in import service.

2. Add data-quality controls:

- Add validation rules for critical fields.
- Track rejected rows with reason codes.

3. Improve observability:

- Add endpoint for recent import run history.
- Add per-run quality summary (duplicate, null, invalid date stats).

## Notes For Large Data

- Route uses raw SQL with NOT EXISTS for efficient anti-join lookup.
- voting.nik is indexed in migration for faster validation query performance.