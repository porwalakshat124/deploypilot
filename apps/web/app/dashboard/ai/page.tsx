"use client";
import { useState } from "react";
import { apiRequest } from "../../../lib/api";
import { useApiResource } from "../../../lib/use-api-resource";
import { Card, PageHeader } from "../ui";
import { Notice, useFeedback } from "../feedback";

type Message = { role: "user" | "assistant"; content: string };
export default function AIPage() {
  const status = useApiResource<{enabled:boolean;perMinute:number;perDay:number;sharedDailyLimit:number}>("/v1/ai/status");
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !question.trim() || !status.data?.enabled) return;
    const message: Message = {role:"user",content:question.trim()};
    // Bound recent conversation before sending; the API validates it independently.
    const history: Message[] = [message];
    let characters = message.content.length;
    for (const previous of messages.slice(-5).reverse()) {
      if (previous.content.length > 1500 || characters + previous.content.length > 3000) break;
      history.unshift(previous); characters += previous.content.length;
    }
    setBusy(true); feedback.clear();
    try {
      const result = await apiRequest<{reply:string}>("/v1/ai/chat", {method:"POST",body:JSON.stringify({messages:history})});
      setMessages(current=>[...current,message,{role:"assistant" as const,content:result.reply}].slice(-40));
      setQuestion("");
    } catch(error) {feedback.fail(error,"Unable to send your question");}
    finally {setBusy(false);}
  }
  return <><PageHeader eyebrow="Intelligence / Support" title="AI assistant" description="Ask about GitHub imports, Docker workers and deployment troubleshooting." />
    <Card><p>Powered by Groq's free API. Your question and recent chat messages are sent to Groq. The assistant cannot read your repositories or deployment logs, run commands or apply changes.</p><p style={{color:"var(--muted)"}}>Do not paste credentials or private code. Common token patterns are redacted, but redaction cannot detect every secret. Chat stays in this page's memory and clears when you leave or start a new chat.</p>{status.data && <p>{status.data.perMinute} requests per minute and {status.data.perDay} per day per account; {status.data.sharedDailyLimit} requests per day shared across the beta. Provider limits may be lower. Daily limits reset at midnight UTC. No paid fallback.</p>}<Notice message={status.error} retry={status.reload} />{!status.loading && status.data && !status.data.enabled && <p role="status">AI chat is not configured yet. Please try again later.</p>}</Card>
    <Card style={{marginTop:16}}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><h2>Chat</h2><button className="dp-btn" disabled={busy || !messages.length} onClick={()=>{setMessages([]);feedback.clear();}}>New chat</button></div>
      {!messages.length && <p style={{color:"var(--muted)"}}>Try: “How do I import a GitHub repository?” or “Why is my Docker worker offline?”</p>}
      <div role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions" style={{maxHeight:500,overflowY:"auto"}}>{messages.map((message,index)=><article key={index} style={{padding:16,marginBottom:12,border:"1px solid var(--line)",borderRadius:12,background:message.role==="user"?"var(--surface)":"transparent"}}><strong>{message.role==="user"?"You":"DeployPilot assistant"}</strong><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",lineHeight:1.7}}>{message.content}</p></article>)}</div>
      <form onSubmit={event=>void send(event)}><label className="dp-label">Your question<textarea className="dp-input" value={question} maxLength={1500} rows={4} disabled={busy} onChange={event=>setQuestion(event.target.value)} placeholder="Ask a deployment question…" /></label><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}><small style={{color:"var(--muted)"}}>{question.length}/1500 characters</small><button className="dp-btn dp-btn-primary" type="submit" disabled={busy || !question.trim() || !status.data?.enabled}>{busy?"Thinking…":"Send message"}</button></div><Notice message={feedback.message} dismiss={feedback.clear} /><p role="status" style={{color:"var(--muted)"}}>{busy?"The assistant is preparing a reply.":"AI can make mistakes. Review suggestions before using them."}</p></form>
    </Card></>;
}
