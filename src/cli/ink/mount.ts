import { render } from "ink";
import { createElement } from "react";
import type Database from "libsql";
import { ChatApp } from "./ChatApp.js";

/** Mounts the chat UI and resolves when the user exits. */
export async function runChatApp(opts: {
  db: Database.Database;
  onboardingPrompt?: string;
}): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error("ray chat requires an interactive TTY.");
    return;
  }

  const instance = render(createElement(ChatApp, opts));
  await instance.waitUntilExit();
}
