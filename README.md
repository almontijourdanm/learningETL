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

## Notes For Large Data

- Route uses raw SQL with NOT EXISTS for efficient anti-join lookup.
- voting.nik is indexed in migration for faster validation query performance.