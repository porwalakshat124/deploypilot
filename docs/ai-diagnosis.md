# Failure diagnosis

Set `AI_DIAGNOSIS_ENABLED=true` on the API with a valid `GROQ_API_KEY`. The Diagnose failure action requires existing deployment authorization and a failed deployment. It sends up to 20 redacted log messages (300 characters each), selected non-secret build settings and required secret names to Groq. Redaction reduces exposure but cannot recognize every secret; applications must avoid printing credentials.

Groq returns strict structured JSON using `openai/gpt-oss-20b`. Evidence must quote actual supplied log messages and their sequences. The result suggests actions without executing them. Cached results avoid repeat provider calls. Chat and diagnosis share per-user and global minute/day limits. There are no retries or paid provider fallbacks when the free quota is exhausted.
