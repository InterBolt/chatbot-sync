import parse from "./lib/parse";
import { resolve } from "path";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import log from "./lib/log";
import { prettyError, withPrefix } from "./lib/utils";

const create = async () => {
  let created = false;
  const botsDirname = "bots";
  const botsDir = resolve(process.cwd(), botsDirname);

  if (!existsSync(botsDir)) {
    throw new Error(
      `The bots directory does not exist. Please create a directory named "${botsDirname}" in the root of your project.`
    );
  }

  const botName = process.argv[2];

  if (botName === undefined) {
    log.error(
      "Please provide a bot name as the first argument likeso: `npm run create-bot [bot-name]`"
    );
    process.exit(1);
  }

  const prefixedBotName = withPrefix(botName);
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
    log.info(`Created dataset with hello world file for`, prefixedBotName);
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
    log.info(`Created hello world skill for`, prefixedBotName);
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
    log.info(`Created system prompt files for`, prefixedBotName);
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
    log.info(`Created dynamic.ts file for`, prefixedBotName);

    await parse(botsDir);

    log.success(`Created bot`, prefixedBotName);
  } catch (err: any) {
    prettyError(err);
    if (created) {
      rmSync(botDir, { recursive: true });
      log.warn(`Deleted bot directory`, prefixedBotName);
    }
  }
};

create();
