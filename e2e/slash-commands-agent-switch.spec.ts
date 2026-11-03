import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { addWorkspace, createProfile, signIn, startConversation } from "./helpers.ts";
import { TestHost, writeBunProgram } from "./test-host.ts";

const host = new TestHost({ fakePrograms: true });

test.beforeAll(async () => {
  writeBunProgram(host.fakeProgramsDir, "opencode", join(import.meta.dirname, "fake-acp-agent.ts"), { FAKE_ACP_PROMPTS: join(host.root, "prompts") });
  await host.start();
});
test.afterAll(async () => {
  await host.stop();
  await host.cleanUp();
});

test("a conversation moved to an agent that has listed no commands stops suggesting those of the agent it left", async ({ page }) => {
  await signIn(page, host);
  await addWorkspace(page, host.projectDir);
  const profiles = await createProfile(page, "Silent", "", "", "opencode");
  await profiles.getByRole("button", { name: "Close" }).click();
  const composer = page.locator(".composer:visible textarea");
  const menu = page.getByRole("listbox", { name: "Slash commands" });
  const command = (name: string) => menu.locator(".slash-command-name", { hasText: new RegExp(`^/${name}$`) });
  const suggestsClaudeCommands = async () => {
    await composer.fill("/");
    await expect(command("context")).toBeVisible({ timeout: 60_000 });
  };
  const moveToSilentAgent = async () => {
    await composer.fill("");
    await page.getByLabel("Profile", { exact: true }).filter({ visible: true }).selectOption({ label: "Silent · opencode" });
    await expect(page.locator(".chat-header:visible .harness")).toHaveText("opencode");
  };
  /** Only Mirador's own remain, once the page has had the time to hear the host's guess, which nothing on screen marks. */
  const suggestsOnlyMiradorCommands = async () => {
    await composer.fill("/");
    await expect(command("clear")).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(command("context")).toHaveCount(0);
  };

  await startConversation(page);
  await suggestsClaudeCommands();

  await test.step("from a conversation where Claude Code had listed its commands", async () => {
    await startConversation(page);
    await suggestsClaudeCommands();
    await moveToSilentAgent();
    await suggestsOnlyMiradorCommands();
  });

  await test.step("from a conversation showing the guess from another Claude Code conversation", async () => {
    await startConversation(page, { withModels: false });
    await suggestsClaudeCommands();
    await moveToSilentAgent();
    await suggestsOnlyMiradorCommands();
  });
});
