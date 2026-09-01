# Agora AI

## LMS-Agnostic AI Socratic Tutor

Agora is an AI tutoring platform designed to provide **curriculum-grounded, Socratic tutoring with adaptive scaffolding and deterministic mastery tracking**.

The v2 architecture separates the tutoring system into independently replaceable layers:

* **Curriculum** — defines what the student is learning.
* **Retrieval** — provides relevant syllabus and teacher-provided resources.
* **LLM adapters** — evaluate responses and generate tutor messages.
* **Mastery engine** — deterministically tracks learning progress.
* **Scaffolding** — controls how much assistance the student receives.
* **LTI integration** — connects Agora to supported LMS platforms.
* **AGS** — sends mastery/score information back to an LMS gradebook.
* **Frontend** — provides the student and teacher experience.

The current MVP supports:

* Cambridge Lower Secondary Stage 8 English
* Cambridge Lower Secondary Stage 9 Mathematics

The architecture is intentionally extensible to additional subjects, curricula, LLM providers, and LMS integrations.

---

# 1. System Requirements

## Backend

* Node.js 22+
* TypeScript
* Express
* PostgreSQL 16+
* `pgvector`
* `jose`
* `ws`

## Frontend

* React
* TypeScript
* Vite
* Tailwind CSS

## LLM providers

Currently supported:

* Google Gemini
* Anthropic Claude

The provider is selected at runtime through environment configuration.

## LMS

The current LTI implementation targets LMS platforms supporting **LTI 1.3 / LTI Advantage**, including platforms such as:

* Moodle
* Canvas

Google Classroom requires a separate Google Classroom API integration and should not be configured as though it were an LTI 1.3 platform.

---

# 2. Repository Structure

A simplified project structure is:

```text
agora-v2/
│
├── backend/
│   ├── src/
│   │   ├── curriculum/
│   │   │   ├── packs/
│   │   │   └── curriculumLoader.ts
│   │   │
│   │   ├── db/
│   │   │   ├── pool.ts
│   │   │   ├── schema.sql
│   │   │   └── init.ts
│   │   │
│   │   ├── engine/
│   │   │   ├── masteryEngine.ts
│   │   │   └── socraticEngine.ts
│   │   │
│   │   ├── llm/
│   │   │   ├── adapter.ts
│   │   │   ├── claude.ts
│   │   │   ├── config.ts
│   │   │   ├── create-adapter.ts
│   │   │   ├── gemini.ts
│   │   │   ├── index.ts
│   │   │   └── prompts.ts
│   │   │
│   │   ├── lti/
│   │   │   ├── ags.ts
│   │   │   ├── login.ts
│   │   │   ├── launch.ts
│   │   │   ├── jwks.ts
│   │   │   ├── platformConfig.ts
│   │   │   └── mockPlatform.ts
│   │   │
│   │   ├── retrieval/
│   │   │   └── retrieval.ts
│   │   │
│   │   ├── routes/
│   │   │   └── sessions.ts
│   │   │
│   │   └── types.ts
│   │
│   └── .env
│
└── frontend/
    └── src/
```

---

# 3. Local Setup

## 3.1 Create the PostgreSQL database

For a local PostgreSQL installation:

```bash
createdb agora_v2
```

Enable `pgvector`:

```bash
psql agora_v2 -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

---

# 4. PostgreSQL Application Role

Agora should not connect to PostgreSQL as a superuser.

Create a dedicated application role:

```sql
CREATE ROLE agora_app LOGIN PASSWORD 'change-me';

GRANT CONNECT ON DATABASE agora_v2 TO agora_app;

GRANT USAGE ON SCHEMA public TO agora_app;

GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA public
TO agora_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLES TO agora_app;
```

Your application connection should then use:

```env
DATABASE_URL=postgresql://agora_app:change-me@localhost:5432/agora_v2
```

## Why a non-superuser is required

Agora uses PostgreSQL Row-Level Security (RLS) as a database-level isolation mechanism.

PostgreSQL superusers bypass RLS.

Therefore:

```text
Application
    ↓
non-superuser PostgreSQL role
    ↓
RLS policies
    ↓
course-scoped data
```

is required for the intended security model.

Application-level `WHERE course_id = ...` filtering remains in place, but RLS provides a database-level backstop against accidental cross-course access.

---

# 5. Backend Installation

```bash
cd backend
npm install
```

Create the environment file:

```bash
cp .env.example .env
```

Then configure the required values.

---

# 6. Environment Configuration

A typical local configuration looks like:

```env
DATABASE_URL=postgresql://agora_app:change-me@localhost:5432/agora_v2

LLM_PROVIDER=gemini
LLM_MODEL=gemini-3.7-flash

GEMINI_API_KEY=your-gemini-key

AGORA_BASE_URL=http://localhost:4000
```

Claude can be selected instead:

```env
LLM_PROVIDER=claude
LLM_MODEL=claude-haiku-4-5

ANTHROPIC_API_KEY=your-anthropic-key
```

Only the API key for the selected provider needs to be available.

---

# 7. LLM Configuration

Agora does not hard-code a single LLM provider into the tutoring engine.

The provider-neutral interface is:

```ts
LlmAdapter
```

The supported providers are currently:

```ts
type LlmProvider = 'gemini' | 'claude' | 'openai';
```

OpenAI is reserved in the configuration architecture but its adapter is not currently implemented.

## Provider selection

```env
LLM_PROVIDER=gemini
```

or:

```env
LLM_PROVIDER=claude
```

## Model selection

```env
LLM_MODEL=gemini-3.7-flash
```

or:

```env
LLM_MODEL=claude-haiku-4-5
```

If `LLM_MODEL` is not supplied, `config.ts` selects the provider's configured default.

The architecture is:

```text
.env
 │
 ├── LLM_PROVIDER
 │
 └── LLM_MODEL
        │
        ▼
  getLlmConfig()
        │
        ▼
 createLlmAdapter()
        │
   ┌────┴─────┐
   ▼          ▼
Gemini      Claude
Adapter     Adapter
```

---

# 8. LLM Responsibilities

Every provider implements the same interface:

```ts
interface LlmAdapter {
  evaluateTurn(ctx: EvalContext): Promise<TurnEvaluation>;

  generateScaffold(
    ctx: ScaffoldContext
  ): Promise<ScaffoldResponse>;

  generateExploratoryAnswer(
    ctx: ExploratoryContext
  ): Promise<string>;
}
```

## `evaluateTurn`

Determines:

* whether the student's answer is correct
* whether a known misconception was demonstrated
* what the student got right or missed

The evaluator does **not** determine mastery directly.

## `generateScaffold`

Generates the tutor's next intervention according to the deterministic scaffold level selected by the mastery engine.

## `generateExploratoryAnswer`

Handles open conceptual questions without modifying mastery state.

---

# 9. Shared Prompt Architecture

Provider-specific adapters do not own the application's pedagogical instructions.

Shared prompts are defined in:

```text
backend/src/llm/prompts.ts
```

The main prompt builders are:

```ts
buildEvaluationPrompt()
buildScaffoldPrompt()
buildExploratoryPrompt()
```

This ensures Gemini and Claude receive the same curriculum, retrieval, misconception, and pedagogy context.

The provider changes the model generating the response; it does not redefine Agora's educational policy.

---

# 10. Tutor Guardrails

The shared Agora guardrail establishes that the tutor should:

* help the student think rather than replace their thinking
* use Socratic questioning
* provide appropriately sized hints
* remain age-appropriate
* remain encouraging
* avoid shaming students
* avoid exposing internal system information
* avoid exposing evaluation metadata
* avoid exposing misconception labels
* avoid completing work the student is expected to produce

The system is **not** restricted to plain text.

Formatting is allowed when it improves comprehension.

For example, Mathematics may use:

```text
3x + 7 = 22
```

or:

```text
a² + b² = c²
```

English may use quotations, bullet points, headings, or other useful formatting.

The pedagogical restriction is that formatting must not be used as a way to simply provide the student's required answer.

---

# 11. Database Initialization

Run:

```bash
npm run db:init
```

This applies the schema, including:

* courses
* curriculum nodes
* node questions
* mastery states
* sessions
* turns
* documents
* document chunks
* vector columns/indexes
* RLS policies
* LTI platforms
* LTI deployments
* AGS passback logging
* friction alerts

---

# 12. Seed Curriculum

Run:

```bash
npm run seed
```

The curriculum loader registers available curriculum packs.

Current MVP packs include:

```text
Cambridge Lower Secondary Stage 8 English
Cambridge Lower Secondary Stage 9 Mathematics
```

Curriculum packs are stored under:

```text
backend/src/curriculum/packs/
```

Each pack defines its:

* subject
* stage
* strands
* curriculum nodes
* descriptions
* examples/passages
* questions
* misconception triggers

Pack IDs and node IDs must remain globally unique.

---

# 13. LTI Key Provisioning

Generate Agora's RSA signing keys:

```bash
npm run lti:keys
```

Agora publishes its public keys through:

```text
GET /api/lti/jwks
```

These keys are used by LMS/platform integrations when verifying Agora-signed JWTs, including AGS client assertions.

---

# 14. Start the Backend

```bash
npm run dev
```

Default development endpoint:

```text
http://localhost:4000
```

---

# 15. Start the Frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Default Vite endpoint:

```text
http://localhost:5173
```

---

# 16. Local LTI Development

Agora includes a self-hosted mock LMS/platform.

This allows the application to test the LTI flow without Canvas or Moodle.

The mock platform is located under:

```text
backend/src/lti/mockPlatform.ts
```

The local flow exercises the same general application path used by a real LTI platform:

```text
Student
   ↓
Frontend
   ↓
LTI login
   ↓
OIDC authorization
   ↓
LTI launch
   ↓
JWT validation
   ↓
Agora session
   ↓
Tutor
```

The mock implementation is intended for development and integration testing, not production LMS deployment.

---

# 17. LTI 1.3 Integration

Agora's LTI implementation follows the LTI 1.3 / LTI Advantage model.

The primary endpoints are:

```text
GET/POST /api/lti/login
POST     /api/lti/launch
GET      /api/lti/jwks
```

The exact HTTP methods should be taken from the deployed route definitions when registering the tool.

The URLs presented to an LMS are based on:

```env
AGORA_BASE_URL
```

For example, if:

```env
AGORA_BASE_URL=https://tutor.example.com
```

the corresponding endpoints are:

```text
https://tutor.example.com/api/lti/login
https://tutor.example.com/api/lti/launch
https://tutor.example.com/api/lti/jwks
```

The production URLs must be publicly reachable over HTTPS.

---

# 18. LTI Platform Registration

For a real LTI-compatible LMS, Agora must be registered as an LTI 1.3 tool.

The platform registration generally involves:

```text
Agora
  ↓
LMS registration
  ↓
client_id
issuer
authorization endpoint
token endpoint
platform JWKS URL
deployment_id
```

The platform configuration is stored in Agora's LTI configuration/database tables.

The core tables include:

```text
lti_platforms
lti_deployments
```

---

# 19. Moodle Integration

Moodle is an appropriate target for Agora's LTI 1.3 implementation.

At a high level:

1. Enable Moodle's LTI Advantage functionality.
2. Register Agora as an external tool.
3. Configure Agora's LTI endpoints.
4. Configure the LTI 1.3 issuer/client information.
5. Enable the required services/scopes.
6. Record Moodle's platform metadata in Agora.
7. Launch Agora from a Moodle course.

Agora needs the platform's LTI information, including values equivalent to:

```text
issuer
client_id
authorization endpoint
token endpoint
JWKS endpoint
deployment_id
```

Agora then validates the incoming LTI launch JWT against the platform's published JWKS.

The launch provides identity and course context which Agora uses to provision or locate:

* institution
* course
* student
* instructor
* deployment
* session context

---

# 20. Moodle AGS Grade Passback

For gradebook integration, Agora uses **LTI Assignment and Grade Services (AGS)**.

The flow is:

```text
Student completes interaction
          ↓
Mastery engine updates state
          ↓
Agora calculates mastery result
          ↓
AGS client assertion
          ↓
Moodle token endpoint
          ↓
Access token
          ↓
AGS score endpoint
          ↓
Moodle gradebook
```

Agora's AGS implementation is responsible for:

* creating/signing the client assertion
* obtaining the access token
* calling the platform's AGS endpoint
* submitting the score
* recording the result

The application treats grade passback as asynchronous so an LMS outage does not block the student experience.

---

# 21. Canvas Integration

Canvas also supports LTI 1.3 / LTI Advantage.

The registration process follows the same fundamental pattern:

1. Create/register an LTI developer key.
2. Configure Agora's login initiation URL.
3. Configure Agora's launch/redirect URL.
4. Configure Agora's public JWKS URL.
5. Obtain the Canvas issuer/client/deployment information.
6. Store the platform configuration in Agora.
7. Install/enable the tool in the desired course.
8. Launch Agora from Canvas.

Agora's endpoints are:

```text
{AGORA_BASE_URL}/api/lti/login
{AGORA_BASE_URL}/api/lti/launch
{AGORA_BASE_URL}/api/lti/jwks
```

For gradebook integration, Canvas communicates through the LTI Assignment and Grade Services flow supported by the deployment.

---

# 22. Google Classroom Integration

Google Classroom should be treated differently from Moodle and Canvas.

Google Classroom is **not simply another LTI 1.3 registration target** for this implementation.

A direct Google Classroom integration should use Google's APIs and OAuth-based authorization.

The conceptual architecture is:

```text
Google Classroom
       ↓
Google OAuth
       ↓
Google Classroom API
       ↓
Agora integration
       ↓
Course / student / assignment context
```

The Google integration would therefore be a separate adapter/integration layer rather than another entry in the LTI platform configuration.

A future Google Classroom integration would typically need to address:

* Google Cloud project configuration
* OAuth consent configuration
* OAuth client credentials
* Classroom API access
* course discovery
* student/course membership
* coursework/assignment mapping
* submission handling
* grades/feedback synchronization
* Google API scopes
* teacher authorization

This separation is intentional.

Agora's internal tutoring engine should not know whether course context originated from Moodle LTI, Canvas LTI, or Google Classroom OAuth.

---

# 23. LMS Integration Boundary

The desired architecture is:

```text
                 ┌──────────────┐
                 │     Agora    │
                 │ Tutoring Core│
                 └───────┬──────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
       Moodle          Canvas       Google
        LTI 1.3        LTI 1.3      Classroom API
          │              │              │
          └──────────────┴──────────────┘
                         │
                    Course/User
                     Context
```

This means the core engine should operate on Agora's internal concepts rather than LMS-specific objects.

---

# 24. Retrieval Architecture

Retrieval is deliberately separate from LLM generation.

The retrieval layer is responsible for finding relevant educational material.

The LLM is responsible for reasoning over the supplied material and producing the response.

The pipeline is:

```text
Curriculum
    +
Teacher Documents
    +
Course Resources
    ↓
Document ingestion
    ↓
Chunking
    ↓
Embedding / lexical indexing
    ↓
Retrieval
    ↓
RetrievedResource[]
    ↓
LLM
```

---

# 25. Embeddings

Embeddings are used for semantic retrieval.

They should be treated as a separate model/configuration from the conversational LLM.

For example:

```text
LLM_PROVIDER=gemini
LLM_MODEL=gemini-3.7-flash
```

does not mean that every embedding operation must use the same model configuration.

The retrieval architecture is intentionally designed so that the embedding implementation can evolve independently.

When vector embeddings are available, `pgvector` can perform similarity-based retrieval.

Where embeddings are unavailable, the system can fall back to lexical matching.

This gives the MVP a useful development mode without making external embedding infrastructure a hard dependency for every local setup.

---

# 26. Document Ingestion

Teacher-provided resources can be ingested from supported formats such as:

* PDF
* DOCX
* Markdown
* TXT

The ingestion flow is:

```text
Upload
  ↓
Parse
  ↓
Chunk
  ↓
Associate with course/node
  ↓
Generate embedding where configured
  ↓
Store document/chunks
  ↓
Retrieve during tutoring
```

Documents and chunks are course-scoped.

RLS provides an additional database-level protection layer around this data.

---

# 27. Multi-Resource Retrieval

Agora does not assume that one document contains all the information required to answer a student's question.

Retrieval can combine:

* curriculum material
* node content
* teacher notes
* rubrics
* assignment guidance
* course documents

The LLM receives these as labeled resource blocks.

This is particularly important for exploratory questions.

---

# 28. Guided Socratic Mode

The guided tutoring endpoint is:

```text
POST /api/sessions/:id/turns
```

A guided turn follows this pipeline:

```text
Student attempt
      ↓
Load curriculum node
      ↓
Retrieve resources
      ↓
Evaluate attempt
      ↓
Apply mastery transition
      ↓
Determine scaffold level
      ↓
Generate tutor response
      ↓
Persist turn
      ↓
Create friction alert if necessary
      ↓
Fire AGS passback asynchronously
```

The student's response therefore passes through both an LLM evaluation layer and a deterministic mastery layer.

---

# 29. Exploratory Mode

The exploratory endpoint is:

```text
POST /api/exploratory
```

Exploratory mode is intended for broader conceptual questions.

Examples:

```text
What is the difference between tone and mood?

Why does multiplying two negative numbers give a positive number?

How does the Pythagorean theorem work?
```

Exploratory mode:

* retrieves relevant resources
* generates an explanatory response
* does not modify mastery state
* does not advance scaffold state
* does not treat the question as a specific assessment attempt

This provides a separate space for curiosity and conceptual clarification.

---

# 30. Mastery Engine

The mastery engine is deterministic and provider-independent.

The LLM evaluates the student's attempt.

The mastery engine decides what that evaluation means for the student's state.

The engine tracks:

```text
p_mastery
correct_count
incorrect_count
hint_count
consecutive_successes
time_on_task_seconds
last_misconception
```

The initial mastery state is deliberately conservative.

Mastery changes according to the deterministic rules in:

```text
engine/masteryEngine.ts
```

This makes progression reproducible and testable independently of model variability.

---

# 31. Scaffold Levels

The current scaffold state machine uses five levels:

```text
Level 0
Open Socratic question

Level 1
Targeted conceptual nudge

Level 2
Small micro-question

Level 3
Technique demonstrated on an unrelated example

Level 4
Confidence-building next step after repeated difficulty
```

The mastery engine selects the level.

The LLM generates the actual wording.

This distinction is important:

```text
Mastery engine
→ determines assistance level

LLM
→ determines natural-language response
```

---

# 32. Hint Cap and Friction Alerts

Courses can configure the maximum hint/friction threshold.

When the threshold is reached, the mastery engine can create a friction alert.

Alerts may be triggered by:

* repeated difficulty
* repeated misconceptions
* excessive hint usage

The alert is persisted in:

```text
friction_alerts
```

and can be surfaced through the application's realtime/WebSocket mechanisms.

---

# 33. Pedagogy Directness

Courses may configure:

```text
pedagogy_directness
```

with a range of:

```text
0.0 → maximally Socratic
1.0 → maximally direct
```

The value is passed to scaffold generation.

This allows teacher-controlled adjustment without modifying the application code or changing the mastery algorithm.

---

# 34. Curriculum Packs

Curriculum is implemented as pluggable packs.

Example:

```text
curriculum/packs/
├── cambridgeStage8English.ts
└── cambridgeStage9Math.ts
```

A curriculum pack contains:

```text
pack_id
subject
stage_label
strands
nodes
```

Each node can contain:

* ID
* strand
* title
* description
* sample passage/problem
* question
* misconception triggers
* ordering information

The curriculum loader seeds registered packs into PostgreSQL.

---

# 35. Security Model

Agora uses multiple layers of isolation.

## Application layer

Queries explicitly scope data by course.

## Database layer

RLS policies protect course-scoped documents and chunks.

## Authentication layer

LTI launch JWTs are cryptographically verified.

## Key infrastructure

Agora publishes public signing keys through JWKS.

## LLM layer

Internal system information is excluded from student-facing responses.

## API layer

External LMS integrations are kept behind explicit integration boundaries.

---

# 36. LTI Identity and Course Provisioning

A successful LTI launch provides Agora with identity and contextual claims.

Agora can use those claims to create or update:

* institution
* course
* user
* role
* deployment
* session context

This allows a student to enter Agora through an LMS without requiring a separate Agora username/password flow for the LTI launch.

---

# 37. AGS Reliability

Grade passback is intentionally fire-and-forget.

The tutoring interaction should not become:

```text
Student
 ↓
Tutor
 ↓
Wait for LMS
 ↓
Response
```

Instead:

```text
Student
 ↓
Tutor
 ↓
Response

      └────→ asynchronous AGS passback
```

AGS activity is logged in the database so failures can be diagnosed or retried.

---

# 38. API Surface

The main application flows include:

```text
LTI

/api/lti/login
/api/lti/launch
/api/lti/jwks
```

Guided tutoring:

```text
/api/sessions/:id/turns
```

Exploratory tutoring:

```text
/api/exploratory
```

Additional routes may exist for:

* session exchange
* teacher functionality
* document ingestion
* curriculum
* health checks
* mock LMS operations

The definitive API contract should be taken from the route implementations and request/response types in the current source tree.

---

# 39. Running the Complete Local Stack

A typical local startup sequence is:

### Terminal 1 — Database

```bash
createdb agora_v2

psql agora_v2 -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

Create the `agora_app` role and grants as described above.

### Terminal 2 — Backend

```bash
cd backend

npm install
npm run db:init
npm run seed
npm run lti:keys
npm run dev
```

### Terminal 3 — Frontend

```bash
cd frontend

npm install
npm run dev
```

Then open:

```text
http://localhost:5173
```

---

# 40. Production Considerations

A production deployment should not use:

```text
localhost
```

for LMS callback URLs.

The production backend must have a stable HTTPS URL.

For example:

```text
https://tutor.example.com
```

which produces:

```text
https://tutor.example.com/api/lti/login
https://tutor.example.com/api/lti/launch
https://tutor.example.com/api/lti/jwks
```

The production database should:

* use TLS
* use a dedicated non-superuser
* use a strong generated password
* restrict network access
* protect backups
* protect document data
* rotate credentials appropriately

API keys should never be committed to source control.

---

# 41. Current v2 Changes

The current implementation represents a substantial architectural change from the earlier Claude-centric version.

## Provider-neutral LLM layer

The tutoring engine no longer depends directly on Claude.

Instead:

```text
engine
  ↓
llm
  ↓
LlmAdapter
  ↓
GeminiAdapter / ClaudeAdapter
```

This makes provider switching a configuration operation rather than an engine rewrite.

---

## Centralized LLM configuration

The new configuration layer defines:

```text
LLM_PROVIDER
LLM_MODEL
```

Provider-specific model defaults are centralized in `config.ts`.

---

## Provider factory

`create-adapter.ts` resolves the configured provider.

This prevents provider-specific selection logic from spreading throughout the backend.

---

## Shared prompts

The tutoring prompts were moved into:

```text
llm/prompts.ts
```

Gemini and Claude therefore receive the same high-level pedagogical instructions.

---

## Shared tutoring guardrails

Agora's tutoring rules are now centralized.

The model is instructed to:

* support student thinking
* avoid completing student work
* use Socratic techniques
* remain encouraging
* remain age appropriate
* avoid exposing internal metadata
* use retrieved resources appropriately

---

## Rich educational formatting

The v2 tutor is no longer constrained to plain text.

Formatting can be used where useful.

This is particularly important because Agora now targets both:

```text
English
Mathematics
```

A mathematical response may need equations, structured working, or lists.

An English response may benefit from quotations, emphasis, headings, and examples.

The restriction is pedagogical, not typographical.

---

## Exploratory tutoring

Exploratory mode is now a first-class provider-neutral operation.

It uses:

```ts
generateExploratoryAnswer()
```

and remains separate from mastery mutation and scaffold progression.

---

## Deterministic mastery

Mastery remains outside the LLM.

This protects the application from allowing model variability to directly determine progression.

---

## Stronger type safety

The mastery engine maintains the constrained `hint_count` state defined by `MasteryState`.

Numeric calculations that return generic `number` values must be narrowed/clamped to the application's allowed state representation before assignment.

---

## Embeddings separated from generation

Embedding/retrieval infrastructure is now documented as an independent subsystem.

The conversational model and embedding model do not need to be the same provider or configuration.

This allows future changes to the retrieval stack without changing the tutoring adapter contract.

---

# 42. Testing Status

The following areas have been exercised against real/local infrastructure:

* PostgreSQL 16
* pgvector
* schema initialization
* RLS behavior
* non-superuser database access
* curriculum seeding
* document ingestion
* LTI 1.3 mock flow
* OIDC login
* JWT verification
* nonce verification
* JWKS
* role detection
* course/user provisioning
* session creation
* AGS client assertion generation
* AGS token flow
* AGS score submission
* mock gradebook readback
* frontend build
* backend type checking

The local mock LMS exercises the LTI flow without requiring an external LMS.

Real production integrations still require platform-specific registration and credentials.

---

# 43. External Dependencies Not Guaranteed by Local Tests

A successful local build does not prove that every external service is reachable.

External dependencies include:

* Gemini API
* Anthropic API
* embedding provider, where configured
* production PostgreSQL
* Moodle
* Canvas
* Google Classroom APIs, once that integration is implemented
* production LMS gradebook endpoints

For example, an error such as:

```text
TypeError: fetch failed

ECONNRESET

Client network socket disconnected before secure TLS
connection was established
```

indicates a network/TLS connection failure to the external provider and should not automatically be interpreted as an error in the LLM adapter.

Similarly, a DNS record existing does not guarantee that Node.js can successfully establish an HTTPS/TLS connection.

---

# 44. Design Principles

Agora v2 is built around several boundaries.

### Curriculum is not the LLM

Curriculum defines what is taught.

### Retrieval is not generation

Retrieval finds evidence and context.

The LLM reasons over that context.

### The LLM is not the mastery engine

The LLM evaluates responses.

The deterministic mastery engine controls progression.

### Scaffolding is not model selection

The mastery engine determines the assistance level.

The LLM determines the natural-language expression.

### LMS integration is not tutoring logic

LTI and future Google Classroom integrations provide identity, course, and assessment interoperability.

The tutoring engine remains LMS-independent.

### Provider configuration is not application logic

Gemini and Claude are interchangeable implementations behind the same adapter contract.

---

# 45. Target Architecture

The long-term architecture is:

```text
                         LMS ECOSYSTEM
                              │
              ┌───────────────┼────────────────┐
              │               │                │
           Moodle          Canvas          Google
          LTI 1.3         LTI 1.3        Classroom API
              │               │                │
              └───────────────┼────────────────┘
                              │
                       Integration Layer
                              │
                              ▼
                     ┌─────────────────┐
                     │ Agora Core      │
                     │                 │
                     │ Curriculum      │
                     │ Retrieval       │
                     │ Mastery         │
                     │ Scaffolding     │
                     └────────┬────────┘
                              │
                         LLM Adapter
                              │
                    ┌─────────┴─────────┐
                    │                   │
                 Gemini               Claude
                    │                   │
                    └─────────┬─────────┘
                              │
                       Tutor Response
                              │
                              ▼
                           Student
```

The goal is to keep every external dependency behind an explicit boundary so that Agora's educational core remains stable as infrastructure changes.

---

# 46. Summary

Agora v2 is not simply a chatbot connected to an LMS.

It is a layered tutoring system:

```text
LMS
 ↓
Identity / Course Context
 ↓
Curriculum
 ↓
Retrieval
 ↓
LLM Evaluation
 ↓
Deterministic Mastery
 ↓
Adaptive Scaffolding
 ↓
LLM Tutor Response
 ↓
Student
 ↓
AGS / LMS
```

The current MVP provides a foundation for:

* Cambridge English
* Cambridge Mathematics
* Gemini
* Claude
* PostgreSQL
* pgvector
* Moodle LTI 1.3
* Canvas LTI 1.3
* local mock-LMS testing
* adaptive Socratic scaffolding
* deterministic mastery
* teacher-controlled pedagogy
* curriculum-grounded exploratory tutoring

Google Classroom should be implemented as a **separate Classroom API/OAuth integration**, rather than being incorrectly forced into the LTI 1.3 adapter.

This separation keeps the platform extensible and prevents LMS-specific integration concerns from leaking into the tutoring engine.
