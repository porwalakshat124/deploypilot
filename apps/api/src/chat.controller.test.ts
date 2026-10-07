import { expect, it, vi } from "vitest";
import { ChatController } from "./chat.controller.js";
it("uses the authenticated identity and rejects anonymous chat before provider access",async()=>{
  const user=vi.fn().mockResolvedValue({id:"verified"});const chat=vi.fn();const controller=new ChatController({user} as never,{chat} as never);
  await controller.chat({} as never,{messages:[{role:"user",content:"help"}],userId:"forged"} as never);
  expect(chat).toHaveBeenCalledWith("verified",[{role:"user",content:"help"}]);chat.mockClear();user.mockRejectedValue(new Error("Unauthorized"));
  await expect(controller.chat({} as never,{messages:[]})).rejects.toThrow("Unauthorized");expect(chat).not.toHaveBeenCalled();
});
