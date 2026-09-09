# Authentication & Launch Flow

Agora uses the **1EdTech LTI 1.3 Advantage** specification for authentication, user provisioning, role detection, and course scoping.

Because Agora operates as an embedded LTI tool provider, users do **not** authenticate through a traditional username/password login page. Authentication begins when a user launches Agora from an LMS such as Canvas, Moodle, or Blackboard.

For local development, Agora includes a mock LTI platform that simulates the LMS launch flow without requiring a live LMS installation.

---

## Architecture Overview

The authentication flow involves three components:

* **LMS / LTI Platform** — Canvas, Moodle, Blackboard, or the local mock platform
* **Agora Backend** — validates LTI assertions, provisions users/courses, and creates launch sessions
* **Agora Web UI** — exchanges the short-lived launch code and loads the authenticated workspace

```text
┌──────────────┐          ┌──────────────────┐          ┌────────────────┐
│              │          │                  │          │                │
│  LMS / LTI   │          │  Agora Backend   │          │  Agora Web UI  │
│   Platform   │          │                  │          │                │
│              │          │                  │          │                │
└──────┬───────┘          └────────┬─────────┘          └───────┬────────┘
       │                           │                            │
       │  1. OIDC Login Request   │                            │
       │─────────────────────────>│                            │
       │                           │                            │
       │  2. POST id_token        │                            │
       │─────────────────────────>│                            │
       │                           │                            │
       │                           │ 3. Verify JWT + JWKS       │
       │                           │    Provision User/Course   │
       │                           │    Create Launch Code      │
       │                           │                            │
       │                           │ 4. HTTP 302 Redirect       │
       │                           │───────────────────────────>│
       │                           │    /?launch={code}         │
       │                           │                            │
       │                           │                            │
       │                           │ 5. POST /api/session/     │
       │                           │    exchange                │
       │                           │<───────────────────────────│
       │                           │                            │
       │                           │ 6. Session Context JSON    │
       │                           │───────────────────────────>│
       │                           │                            │
       │                           │                            │
       │                           │       Authenticated UI     │
       │                           │<───────────────────────────│
```

---

# 1. LTI 1.3 Launch Cycle

Every authenticated Agora session begins with an **OpenID Connect (OIDC)** launch initiated by the LMS.

## Step 1 — User launches Agora

A student or teacher opens Agora from an LTI-enabled link inside the LMS.

For example:

```text
Canvas
  ↓
Course
  ↓
Agora LTI Tool
  ↓
Agora /api/lti/login
```

The LMS supplies the information required to begin the LTI 1.3 authentication flow.

---

## Step 2 — OIDC authentication

The LMS initiates the OIDC login against:

```text
GET /api/lti/login
```

The backend uses the LTI configuration to establish the authentication transaction.

The LMS subsequently creates and signs an LTI 1.3 `id_token` JWT using its private key.

The token is submitted to:

```text
POST /api/lti/launch
```

---

## Step 3 — Agora validates the launch

The Agora backend validates the incoming LTI assertion.

Validation includes the LMS platform's public signing keys obtained from its **JWKS endpoint**.

Once the token is verified, Agora extracts the relevant LTI claims, including:

* `sub` — unique LMS user identifier
* `name` — user's display name
* `context.id` — LMS course/context identifier
* LTI role claims — instructor/teacher or learner/student
* Additional course and platform information where available

The backend then provisions or updates the corresponding records in PostgreSQL.

Conceptually:

```text
LTI id_token
     │
     ├── User identity
     │      └── Upsert user
     │
     ├── Course context
     │      └── Upsert course
     │
     ├── Role
     │      └── Create/update enrollment
     │
     └── Platform information
            └── Associate LMS deployment
```

This ensures that Agora's internal user and course records remain synchronized with the LMS launch context.

---

# 2. Launch Code Exchange

Agora does not place the full authenticated session context directly in the browser redirect.

Instead, after successful LTI validation, the backend creates a **short-lived, single-use launch code**.

The browser is redirected to:

```text
http://localhost:5173/?launch={code}
```

The frontend reads the `launch` query parameter and exchanges it with the backend:

```text
POST /api/session/exchange
```

The backend validates the launch code and returns the authenticated session context.

The flow is therefore:

```text
LTI id_token
    ↓
/api/lti/launch
    ↓
Validate JWT
    ↓
Provision user/course/enrollment
    ↓
Create short-lived launch code
    ↓
302 → /?launch={code}
    ↓
Frontend reads launch code
    ↓
POST /api/session/exchange
    ↓
Session context
    ↓
Authenticated Agora workspace
```

### Why use a launch code?

The launch code provides a boundary between the LTI authentication transaction and the browser application.

It allows Agora to:

* keep the LTI assertion server-side;
* avoid exposing the full LTI token to the frontend;
* make the launch exchange short-lived;
* make the launch code single-use;
* establish a clean frontend/backend session boundary.

---

# 3. Local Development Without an LMS

You do not need a live Canvas, Moodle, or Blackboard installation to test Agora's authentication flow.

The backend includes a **mock LTI platform simulator**.

The simulator creates a realistic LTI 1.3 launch by generating an ephemeral RSA key pair, signing an `id_token`, and sending it through the same launch endpoint used by a real LMS.

This allows developers to test:

* LTI authentication
* JWT verification
* JWKS handling
* user provisioning
* course provisioning
* enrollment creation
* student/teacher roles
* launch-code generation
* frontend session exchange

---

# 4. Start Agora Locally

Start the backend:

```bash
cd backend
npm install
npm run dev
```

The backend should be available at:

```text
http://localhost:4000
```

Start the frontend in another terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend should be available at:

```text
http://localhost:5173
```

> Use the actual frontend/backend commands defined in your project's `package.json` if they differ.

---

# 5. Student Launch Simulation

To simulate a student launching Agora, open:

```text
http://localhost:4000/api/lti/mock-platform/simulate-launch?role=Student&name=Marcus%20Chen&course=Grade%209%20Math&class_code=MATH-G9
```

This simulates:

```text
Role:
Student

Name:
Marcus Chen

Course:
Grade 9 Math

Class Code:
MATH-G9
```

The mock platform then performs the LTI launch against the Agora backend.

After successful authentication, the browser is redirected to the frontend with a temporary launch code.

---

# 6. Teacher Launch Simulation

To simulate a teacher launch, open:

```text
http://localhost:4000/api/lti/mock-platform/simulate-launch?role=Teacher&name=Dr.%20Sarah%20Jenkins&course=Grade%209%20Math&class_code=MATH-G9
```

This simulates:

```text
Role:
Teacher

Name:
Dr. Sarah Jenkins

Course:
Grade 9 Math

Class Code:
MATH-G9
```

The teacher flow is particularly useful for testing:

* course management;
* teacher workspace access;
* course material ingestion;
* telemetry;
* assignment/rubric workflows;
* instructor-specific permissions.

---

# 7. What Happens During a Mock Launch?

When one of the simulator URLs is opened, the following sequence occurs.

### 1. Generate test identity

The mock platform creates an ephemeral RSA key pair and uses the private key to sign an LTI 1.3 `id_token`.

```text
Mock LMS
   │
   ├── Generate RSA key pair
   │
   └── Sign LTI id_token
```

### 2. Submit the LTI launch

The signed token is submitted to:

```text
POST /api/lti/launch
```

### 3. Validate the token

Agora verifies the JWT against the mock platform's public JWKS.

```text
id_token
   ↓
JWT validation
   ↓
Signature verified
   ↓
Claims accepted
```

### 4. Provision the user

Agora creates or updates the corresponding user.

```text
Marcus Chen
     ↓
users table
```

or:

```text
Dr. Sarah Jenkins
     ↓
users table
```

### 5. Provision the course

The course context from the LTI launch is used to create or update the Agora course.

```text
Grade 9 Math
     ↓
courses table
```

### 6. Create enrollment

The user's LMS role determines the appropriate course membership.

```text
Student
   ↓
Learner enrollment

Teacher
   ↓
Instructor enrollment
```

### 7. Create launch code

Agora creates a short-lived launch code associated with the authenticated context.

```text
launchCode
     ↓
sessionCodeStore
```

### 8. Redirect to the frontend

The browser is redirected to:

```text
http://localhost:5173/?launch={code}
```

### 9. Exchange the launch code

The frontend sends:

```http
POST /api/session/exchange
```

The backend consumes the launch code and returns the session context.

### 10. Render the workspace

The frontend now has enough context to render the appropriate Agora experience.

```text
Student → Student workspace
Teacher → Teacher workspace
```

---

# 8. Important Endpoints

| Endpoint                                 | Purpose                                               |
| ---------------------------------------- | ----------------------------------------------------- |
| `/api/lti/login`                         | Starts the LTI/OIDC authentication flow               |
| `/api/lti/launch`                        | Receives and validates the LTI 1.3 launch             |
| `/api/lti/mock-platform/simulate-launch` | Simulates a launch without a real LMS                 |
| `/api/session/exchange`                  | Exchanges a temporary launch code for session context |

---

# 9. Directly Opening the Frontend

Opening:

```text
http://localhost:5173/
```

directly in a new browser session does **not** authenticate a user.

There is no LTI launch context, so the frontend will not have:

```text
user
course
enrollment
```

available.

This is expected.

Use one of the mock launch URLs instead:

```text
Student:
http://localhost:4000/api/lti/mock-platform/simulate-launch?role=Student&name=Marcus%20Chen&course=Grade%209%20Math&class_code=MATH-G9
```

```text
Teacher:
http://localhost:4000/api/lti/mock-platform/simulate-launch?role=Teacher&name=Dr.%20Sarah%20Jenkins&course=Grade%209%20Math&class_code=MATH-G9
```

---

# 10. Troubleshooting

## `user` or `course` is `null`

You probably opened the frontend directly instead of going through an LTI launch.

Start with one of the mock launch URLs.

---

## Launch verification fails

Check that:

* the backend is running;
* the mock LTI platform is reachable;
* the mock JWKS endpoint is available;
* the LTI issuer/deployment configuration matches;
* the JWT has not expired.

---

## `/api/session/exchange` fails

Check that:

* the `launch` parameter exists in the frontend URL;
* the launch code has not expired;
* the launch code has not already been consumed;
* the backend's session-code store is available.

Launch codes are intentionally short-lived and single-use.

---

## Teacher launches as a student

Check the role supplied to the simulator:

```text
role=Teacher
```

or:

```text
role=Student
```

Also verify the role mapping performed by the LTI launch handler.

---

# 11. Authentication Design Principles

Agora's authentication architecture follows several important principles.

### LMS is the identity provider

Agora does not maintain an independent username/password authentication system for LMS users.

The LMS establishes the user's identity through LTI 1.3.

### Course context comes from the LMS

The LTI `context.id` identifies the LMS course/context associated with the launch.

This allows Agora to scope data and operations to the appropriate course.

### Users are provisioned automatically

A valid LTI launch is sufficient to create or update the corresponding Agora user and course membership.

### Launch codes are temporary

The browser receives a short-lived launch code rather than the original LTI assertion.

### Course scoping is enforced server-side

Backend operations should use the authenticated course context rather than trusting arbitrary course identifiers supplied by the browser.

### Local development mirrors production

The mock platform exercises the same fundamental launch endpoints as a real LMS, allowing the authentication flow to be developed and tested before connecting Agora to an actual LTI platform.

---

# 12. Quick Test

With both frontend and backend running:

### Student

Open:

```text
http://localhost:4000/api/lti/mock-platform/simulate-launch?role=Student&name=Marcus%20Chen&course=Grade%209%20Math&class_code=MATH-G9
```

Expected result:

```text
Mock LMS
   ↓
LTI /api/lti/launch
   ↓
JWT + JWKS verification
   ↓
User/course provisioning
   ↓
Launch code
   ↓
Frontend redirect
   ↓
Session exchange
   ↓
Student workspace
```

### Teacher

Open:

```text
http://localhost:4000/api/lti/mock-platform/simulate-launch?role=Teacher&name=Dr.%20Sarah%20Jenkins&course=Grade%209%20Math&class_code=MATH-G9
```

Expected result:

```text
Mock LMS
   ↓
LTI /api/lti/launch
   ↓
JWT + JWKS verification
   ↓
User/course provisioning
   ↓
Launch code
   ↓
Frontend redirect
   ↓
Session exchange
   ↓
Teacher workspace
```

---

## Authentication Flow at a Glance

```text
┌─────────────────────────────────────────────────────────────┐
│                        LMS / Mock LMS                       │
└────────────────────────────┬────────────────────────────────┘
                             │
                             │ OIDC Login
                             ▼
                    GET /api/lti/login
                             │
                             │
                             ▼
                    POST /api/lti/launch
                             │
                             ▼
                  ┌─────────────────────┐
                  │ Verify LTI JWT      │
                  │ Verify JWKS         │
                  │ Extract claims      │
                  └──────────┬──────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │ Provision / Update  │
                  │ User                │
                  │ Course              │
                  │ Enrollment          │
                  └──────────┬──────────┘
                             │
                             ▼
                  Create short-lived
                     launch code
                             │
                             ▼
               302 → /?launch={code}
                             │
                             ▼
                    ┌─────────────────┐
                    │   Agora Web UI  │
                    └────────┬────────┘
                             │
                             │ POST /api/session/exchange
                             ▼
                    Session Context
                             │
                             ▼
                  ┌─────────────────────┐
                  │ Authenticated Agora │
                  │ Workspace           │
                  └─────────────────────┘
```

This architecture keeps the **LTI authentication boundary in the backend**, provides a clean session handoff to the frontend, and gives developers a reproducible way to test the entire launch cycle without requiring an external LMS.
