import { Body, Controller, Get, Inject, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service.js";
import { ChatService } from "./chat.service.js";

@Controller("/v1/ai")
export class ChatController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(ChatService) private readonly assistant: ChatService) {}
  @Get("status")
  async status(@Req() request: Request) { await this.auth.user(request); return this.assistant.status(); }
  @Post("chat")
  async chat(@Req() request: Request, @Body() body: { messages?: unknown } | null) {
    const user = await this.auth.user(request);
    return this.assistant.chat(user.id, body?.messages);
  }
}
