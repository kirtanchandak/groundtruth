# GroundTruth

GroundTruth is an autonomous, AI-powered B2B data steward designed to continuously audit enterprise databases. It detects contradictions, assigns trust scores, and automatically packages verified updates to sync directly with your CRM. 

Your database is lying. GroundTruth tells you whether to believe it.

## Key Features

- **Multi-Agent Evaluation System**: Utilizes a specialized swarm of agents (Ingestion, Source Hunter, Identity Resolver, Contradiction Analyst, Trust Scorer, and Data PR Writer) to audit and verify CRM records using real-time web evidence.
- **Per-field Trust Scores**: Every field gets a 0-100 score with a precise reasoning chain.
- **Contradiction Detection**: Automatically searches public records, LinkedIn, and news to flag conflicting values.
- **Data Pull Requests (PRs)**: Staged updates that can be reviewed with full evidence and applied instantly to your CRM.
- **Premium Dark Mode UI**: A highly responsive, glassmorphic UI built to visually manage large datasets with beautiful micro-interactions.

## Tech Stack

- **Framework**: Next.js (App Router)
- **Styling**: Tailwind CSS, Lucide React
- **AI/Agents**: OpenAI (gpt-4o-mini)
- **Data Parsing**: PapaParse

## Getting Started

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Set up your environment variables by copying the example file:
   ```bash
   cp .env.example .env.local
   ```
   *Make sure to add your `OPENAI_API_KEY` in `.env.local`.*

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Test Data (CSVs)

If you'd like to test the evaluation pipeline, we have several sample CSV files pre-configured for different edge cases. You can download them directly or find them in the `public/` and root directories.

Upload any of these from the GroundTruth dashboard to see the agents in action:

- **[Standard 2 Rows](/sample-2-rows.csv)**: A basic test file with standard B2B data.
- **[Standard 3 Rows](/sample-3-rows.csv)**: Slightly larger standard set.
- **[Standard 4 Rows](/sample-4-rows.csv)**: The largest standard set for testing pipeline speed.
- **[Conflict Data](/sample-conflict-data.csv)**: Contains intentionally conflicting CRM data to trigger the Contradiction Analyst agent.
- **[Shady Data](/sample-shady-data.csv)**: Contains highly suspicious, fake, or ambiguous company data to test the Identity Resolver and Trust Scorer's low-confidence triggers.
- **[Groundtruth Upload](/sample-groundtruth-upload.csv)**: Another varied dataset located in the root of the project.

## Project Structure

- `/app` - Next.js App Router pages and layouts (including the main Dashboard and Inspector UI).
- `/lib/agents.ts` - Contains the logic for the autonomous agent swarm (Source Hunter, Contradiction Analyst, etc.).
- `/lib/schemas.ts` - Zod schemas and TypeScript types defining the core data structures and Agent UI profiles.
- `/components` - Reusable React components (like the custom SVG `Logo` and Theme Providers).
- `/public` - Static assets, SVG files, and the test CSVs.
