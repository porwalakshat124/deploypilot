# Groq support chat

The authenticated dashboard AI assistant uses Groq's chat completions API directly.
Configure GROQ_API_KEY, GROQ_MODEL=openai/gpt-oss-20b and AI_CHAT_ENABLED=true
only on the API server. Keys must never be public Next.js variables or worker
credentials. Stay on the provider's Free plan; enabling paid provider billing can
incur charges. There is no model retry, secondary provider or paid fallback.

Messages remain in client page memory. Sending includes the question and at most
five recent messages, bounded to 3,000 characters total and 1,500 per message.
Groq processes those texts. No repositories, database records or deployment logs
are automatically included. Common credential patterns are redacted on input and
output; this does not guarantee removal of every secret. Users should never paste
credentials. Answers are plain text; HTML and model-proposed tools are not executed.

The existing atomic PostgreSQL buckets enforce 3 requests/minute and 20/day per
verified user, plus 3/minute and 100/day across the service. Daily windows begin at
midnight UTC and remain stored for two days. Provider quotas may be tighter.
Failed calls consume app limits; quota errors stop immediately without retries.
Chat exposes configuration status, not proof of provider availability.

GET /v1/ai/status and POST /v1/ai/chat require the existing verified GitHub session.
POST accepts {messages:[{role:"user",content:"How do I import a repository?"}]}.
Client-supplied identity and system/tool messages are not accepted as authority.
The assistant provides suggestions and never performs deployment actions.
Failure diagnosis uses Groq separately through the deployment's Diagnose failure action. It shares the chat quota and sends bounded redacted evidence; see `ai-diagnosis.md`.
