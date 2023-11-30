import parse from "./parse";
import { resolve } from "path";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import log from "./log";
import { reportRequestDataWhenProcessExits } from "./chatbotkit";
import colors from "colors/safe";

reportRequestDataWhenProcessExits();

const create = async () => {
  let created = false;
  const botsDirname = "bots";
  const botsDir = resolve(process.cwd(), botsDirname);
  const botName = process.argv[2];

  if (botName === undefined) {
    log.error(
      "Please provide a bot name as the first argument likeso: `npm run create-bot [bot-name]`"
    );
    process.exit(1);
  }

  const botDir = resolve(botsDir, botName);

  try {
    if (existsSync(botDir)) {
      throw new Error(`Bot "${botName}" already exists`);
    }

    const datasetDir = resolve(botDir, "dataset");
    const skillsDir = resolve(botDir, "skills");
    const systemDir = resolve(botDir, "system");
    const skillsHelloWorldDir = resolve(skillsDir, "hello-world");
    const datasetHelloWorldFile = resolve(datasetDir, "hello-world.txt");

    mkdirSync(botDir);
    created = true;

    mkdirSync(datasetDir);
    writeFileSync(datasetHelloWorldFile, "hello world");
    log.info(`Created dataset with files`, `[hello-world.txt]: ${botName}`);
    mkdirSync(skillsDir);
    mkdirSync(skillsHelloWorldDir);
    writeFileSync(
      resolve(skillsHelloWorldDir, "instruction.txt"),
      "Say hello world"
    );
    writeFileSync(
      resolve(skillsHelloWorldDir, "description.txt"),
      "Says hello world"
    );
    log.info(`Created skills`, `[hello-world]: ${botName}`);
    mkdirSync(systemDir);
    writeFileSync(
      resolve(systemDir, "backstory.txt"),
      "ADD YOUR BOT BACKSTORY HERE"
    );
    writeFileSync(
      resolve(systemDir, "matched.txt"),
      "Only use the information below to answer this prompt: {search}."
    );
    writeFileSync(
      resolve(systemDir, "mismatched.txt"),
      "I couldn't find any information for {search}."
    );
    log.info(`Created system prompt files`, botName);
    writeFileSync(
      resolve(botDir, "dynamic.ts"),
      `import type { DynamicBotBuilder } from "../../build-a-bot/types";

const dynamicBot: DynamicBotBuilder = async (fileBot) => {
  return {
    // ADD DYNAMIC OR SENSITIVIE PROMPT DATA HERE
  };
};

export default dynamicBot;
    `.trim()
    );
    log.info(`Created dynamic.ts file`, botName);

    await parse(botsDir);

    log.success(`Created bot`, botName);
  } catch (err: any) {
    if (err.message) {
      log.error(err.message + "\n");
      err.message = err.message.replace(
        `${err.message.toString()}`,
        colors.red("trace")
      );
    }
    console.log(err);
    if (created) {
      rmSync(botDir, { recursive: true });
      log.warn(`Deleted bot directory`, botName);
    }
  }
};

create();
