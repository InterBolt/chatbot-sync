import parse from "./lib/parse";
import { resolve } from "path";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import log from "./lib/log";
import { prettyError, withPrefix } from "./lib/utils";
import { stripIndent } from "common-tags";

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
      "Please provide a bot name as the first argument likeso: `npm run create [bot-name]`"
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
    const abilitiesDir = resolve(botDir, "abilities");
    const identityDir = resolve(botDir, "identity");
    const abilitiesHelloWorldDir = resolve(abilitiesDir, "hello-world");
    const datasetHelloWorldFile = resolve(datasetDir, "hello-world.txt");

    mkdirSync(botDir);
    created = true;

    // Initialize dataset hello world file.
    mkdirSync(datasetDir);
    writeFileSync(datasetHelloWorldFile, "hello world");
    log.info(`Created dataset with hello world file for`, prefixedBotName);

    // Initialize abilities hello world files.
    mkdirSync(abilitiesDir);
    mkdirSync(abilitiesHelloWorldDir);
    writeFileSync(
      resolve(abilitiesHelloWorldDir, "instruction.txt"),
      "Say hello world"
    );
    writeFileSync(
      resolve(abilitiesHelloWorldDir, "description.txt"),
      "Says hello world"
    );
    log.info(`Created hello world ability for`, prefixedBotName);

    // Initialize identity files: backstory, matched, mismatched.
    mkdirSync(identityDir);
    writeFileSync(
      resolve(identityDir, "backstory.txt"),
      "ADD YOUR BOT BACKSTORY HERE"
    );
    writeFileSync(
      resolve(identityDir, "matched.txt"),
      "Only use the information below to answer this prompt: {search}."
    );
    writeFileSync(
      resolve(identityDir, "mismatched.txt"),
      "I couldn't find any information for {search}."
    );
    log.info(`Created identity prompt files for`, prefixedBotName);

    writeFileSync(
      resolve(botDir, "variables.ts"),
      stripIndent`
        import type { VariablesBuilder } from "../../chatbotkit/lib/types";
        
        const variables: VariablesBuilder = async () => {
          return {
            
          };
        };
        
        export default variables;
      `
    );
    log.info(`Created variables.ts file for`, prefixedBotName);

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
