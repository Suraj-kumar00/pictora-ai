   Frontend (Browser)                    Backend (Server)
   ┌─────────────┐                      ┌─────────────┐
   │             │                      │             │
   │  User logs  │                      │             │
   │   in with   │                      │             │
   │   Clerk     │                      │             │
   │             │                      │             │
   │  Gets JWT   │                      │             │
   │   token     │                      │             │
   │             │                      │             │
   │  Sends token│─────Authorization────▶             │
   │  with each  │    Header: Bearer    │             │
   │   request   │     <token>          │             │
   │             │                      │             │
   │             │                      │  Verifies   │
   │             │                      │  token with │
   │             │                      │  public key │
   │             │                      │             │
   │             │                      │  If valid:  │
   │             │                      │  - Extracts │
   │             │                      │    user ID  │
   │             │                      │  - Fetches  │
   │             │                      │    user info│
   └─────────────┘                      └─────────────┘