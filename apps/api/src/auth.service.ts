import { Injectable, ForbiddenException, UnauthorizedException, HttpException } from "@nestjs/common";
import { consumeRateLimit } from "./rate-limit.js";
import { createClient } from "@supabase/supabase-js";
import type { Request } from "express";
import { db } from "@deploypilot/database/client";
let client: ReturnType<typeof createClient> | undefined;
const supabase = () => client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");


@Injectable()
export class AuthService {
  async githubId(request: Request) {
    const token = request.headers.authorization?.replace(/^Bearer /, "");
    const { data, error } = await supabase().auth.getUser(token);
    const identity = data.user?.identities?.find(item => item.provider === "github");
    const id = identity?.identity_data?.provider_id ?? identity?.identity_data?.sub;
    if (error || !id) throw new ForbiddenException("Sign in with GitHub to synchronize repositories");
    return String(id);
  }
  async user(request: Request) {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) throw new UnauthorizedException();
    const { data, error } = await supabase().auth.getUser(authorization.slice(7));
    if (error || !data.user || !data.user.email || !data.user.email_confirmed_at) throw new UnauthorizedException();
    // Decode claims only AFTER Supabase has authenticated this exact token.
    // A linked GitHub identity alone must not permit an email/password session.
    let claims: { sub?: string; amr?: { method?: string }[] };
    try { claims = JSON.parse(Buffer.from(authorization.slice(7).split(".")[1], "base64url").toString("utf8")); }
    catch { throw new UnauthorizedException("Sign in with GitHub"); }
    if (claims.sub !== data.user.id || !claims.amr?.some(item => item.method === "oauth") || !data.user.identities?.some(item => item.provider === "github")) throw new UnauthorizedException("Sign in with GitHub");
    if (!await consumeRateLimit("user", data.user.id, 300)) throw new HttpException("Too many requests. Try again shortly.", 429);
    return db.user.upsert({ where: { supabaseId: data.user.id }, update: { email: data.user.email }, create: { supabaseId: data.user.id, email: data.user.email, displayName: data.user.user_metadata?.user_name ?? data.user.email } });
  }
}
